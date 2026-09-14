// Analytics: read-only aggregates over the ledger, the accounts and clients' synced state. The super
// admin sees the business — revenue, growth, churn and how each coach is doing. A coach sees their
// roster — activity week by week, plan completion, retention, and each client's month.
import { monthlySeries, collectedAt } from '../lib/billing.js';
import { growthSeries, churn, retention, assignmentOn, compliance, clientSummary, rosterProgress, rosterWeekly, monthlyReport } from '../lib/stats.js';
import { DAY, shiftISO } from '../lib/time.js';

export default function analyticsRoutes(ctx) {
  const { db, json, requireRole, role, access, readState, today, TZ_OFFSET_MIN } = ctx;
  const clientsOf = id => db.users.filter(u => role(u) === 'client' && u.coachId === id);

  // Each client's training and plan, the shape rosterProgress reads.
  function clientRows(clients, t, states = clients.map(u => readState(u.id))) {
    return clients.map((u, i) => {
      const S = states[i];
      const a = assignmentOn(db.assignments, u.id, t);
      const c = a ? compliance(S, a, t) : null;
      return {
        id: u.id, name: u.name, access: access(u), ...clientSummary(S, t),
        onPlan: !!a, planName: a?.planName || null, planned: c?.planned ?? null, done: c?.done ?? null, rate: c?.rate ?? null
      };
    });
  }

  return {
    'GET /api/sa/analytics': async (req, res) => {
      if (!requireRole(req, res, 'superadmin')) return;
      const now = Date.now(), t = today();
      const yearAgo = now - 365 * DAY;
      const coaches = db.users.filter(u => role(u) === 'coach');
      const clients = db.users.filter(u => role(u) === 'client');

      const performance = coaches.map(c => {
        const mine = clientsOf(c.id);
        const progress = rosterProgress(clientRows(mine, t), t);
        const entries = db.ledger.filter(e => e.coachId === c.id);
        return {
          id: c.id, name: c.name, access: access(c),
          clients: mine.length, activeClients: progress.activeClients,
          retention: retention(mine.map(u => u.id), db.ledger),
          avgCompliance: progress.avgCompliance, trainedLast7d: progress.trainedLast7d, workouts30d: progress.workouts30d,
          renewals12m: entries.filter(e => e.type === 'client_monthly' && e.created >= yearAgo).length,
          paid12m: entries.reduce((n, e) => { const at = collectedAt(e); return at && at >= yearAgo ? n + e.amount : n; }, 0)
        };
      }).sort((a, b) => b.paid12m - a.paid12m || b.activeClients - a.activeClients || a.name.localeCompare(b.name));

      json(res, 200, {
        revenue: monthlySeries(db.ledger, now, 12, TZ_OFFSET_MIN),
        growth: growthSeries(db.users.map(u => ({ created: u.created, role: role(u) })), now, 12, TZ_OFFSET_MIN),
        churn: { coaches: churn(coaches.map(access)), clients: churn(clients.map(access)) },
        totals: { coaches: coaches.length, clients: clients.length, retention: retention(clients.map(u => u.id), db.ledger) },
        performance
      });
    },

    'GET /api/coach/analytics': async (req, res) => {
      const coach = requireRole(req, res, 'coach'); if (!coach) return;
      const t = today();
      const month = t.slice(0, 7);
      const prevMonth = shiftISO(month + '-01', -1).slice(0, 7);
      const mine = clientsOf(coach.id);
      const states = mine.map(u => readState(u.id));
      const rows = clientRows(mine, t, states);
      const progress = rosterProgress(rows, t);
      const clients = rows.map((r, i) => ({ ...r, thisMonth: monthlyReport(states[i], month), lastMonth: monthlyReport(states[i], prevMonth) }))
        .sort((a, b) => b.thisMonth.workouts - a.thisMonth.workouts || a.name.localeCompare(b.name));
      json(res, 200, {
        month, prevMonth,
        weekly: rosterWeekly(states, t, 12),
        progress,
        retention: retention(mine.map(u => u.id), db.ledger),
        churn: churn(rows.map(r => r.access)),
        clients
      });
    }
  };
}
