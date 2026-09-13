// Coach: runs a roster of clients. Invites them, renews and locks them, builds plans, assigns them,
// and reads each client's progress. Every client lookup goes through ownClient, so a coach can only
// ever reach clients who are linked to them.
import { extendFrom, daysLeft, CLIENT_TERM_DAYS, CLIENT_REMIND_DAYS } from '../lib/access.js';
import { compliance, clientSummary, bodyMetrics, monthlyReport, rosterProgress, recentActivity } from '../lib/stats.js';
import { coachBilling, coachEarningsSeries } from '../lib/billing.js';
import { shiftISO } from '../lib/time.js';

export const PLAN_CATEGORIES = ['Strength Training', 'Fat Loss', 'Muscle Building', 'Cardio', 'HIIT', 'Flexibility', 'Custom'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const NUM_KEYS = ['sets', 'reps', 'sec', 'min', 'speed', 'weight', 'inc', 'repsMin', 'repsMax', 'rest'];
const STR_KEYS = ['mode', 'prog', 'sg'];
const BOOL_KEYS = ['bodyweight', 'side'];
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function cleanEx(e) {
  const o = { id: clip(e.id, 40) };
  for (const k of NUM_KEYS) if (typeof e[k] === 'number' && Number.isFinite(e[k])) o[k] = e[k];
  for (const k of STR_KEYS) if (typeof e[k] === 'string' && e[k]) o[k] = clip(e[k], 40);
  for (const k of BOOL_KEYS) if (typeof e[k] === 'boolean') o[k] = e[k];
  if (typeof e.note === 'string' && e.note.trim()) o.note = clip(e.note, 500);
  return o;
}

// A plan is stored in the same bundle shape the app already imports (frontend/src/lib/plan-share.js),
// so a client adding it to their planner goes through that existing, tested merge. It is rebuilt
// field by field rather than stored as sent, because a bundle ends up inside other people's state.
export function cleanBundle(b, rid) {
  if (!b || !Array.isArray(b.routines)) return null;
  const seen = new Set();
  const routines = b.routines.filter(r => r && Array.isArray(r.ex)).slice(0, 14).map(r => {
    let id = clip(r.id, 40);
    if (!id || seen.has(id)) id = rid();
    seen.add(id);
    return {
      id,
      name: clip(r.name, 60) || 'Routine',
      ...(typeof r.emoji === 'string' && r.emoji ? { emoji: clip(r.emoji, 40) } : {}),
      ...(typeof r.prog === 'string' && r.prog ? { prog: clip(r.prog, 20) } : {}),
      ex: r.ex.filter(e => e && typeof e.id === 'string' && e.id).slice(0, 40).map(cleanEx)
    };
  });
  const week = {};
  for (const [d, id] of Object.entries(b.week || {})) if (/^[0-6]$/.test(d) && seen.has(id)) week[d] = id;
  const customEx = (Array.isArray(b.customEx) ? b.customEx : []).filter(c => c && c.id && c.n).slice(0, 60)
    .map(c => ({ id: clip(c.id, 40), n: clip(c.n, 80), bp: clip(c.bp, 40), ...(c.desc ? { desc: clip(c.desc, 600) } : {}) }));
  return { opengym_plan: 1, routines, week, customEx };
}

export default function coachRoutes(ctx) {
  const { db, json, readBody, saveDb, requireRole, role, access, userById, ownClient, readState, notify, rid, today, newInviteCode, livePresence, removeUserData } = ctx;
  const requireCoach = (req, res) => requireRole(req, res, 'coach');
  const param = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);
  const byNewest = (a, b) => b.created - a.created;
  const clientsOf = id => db.users.filter(u => role(u) === 'client' && u.coachId === id);
  const withUsedBy = i => ({ ...i, usedByName: i.usedBy ? (userById(i.usedBy) || {}).name || null : null });

  // The plan a client is on today: the most recently started assignment that has not ended.
  function currentAssignment(clientId, t) {
    return db.assignments
      .filter(a => a.clientId === clientId && a.start <= t && (!a.end || a.end >= t))
      .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : b.created - a.created))[0] || null;
  }
  const assignmentView = (a, S, t) => ({
    id: a.id, planId: a.planId, planName: a.planName, category: a.category || null,
    start: a.start, end: a.end || null, note: a.note || '', created: a.created, addedAt: a.addedAt || null,
    ...compliance(S, a, t)
  });

  function clientRow(u, now, t, S = readState(u.id)) {
    const a = currentAssignment(u.id, t);
    return {
      id: u.id, name: u.name, created: u.created || null, note: u.coachNote || '',
      access: access(u), paidUntil: u.paidUntil || null, daysLeft: daysLeft(u.paidUntil, now), locked: !!u.locked,
      live: livePresence(u.id),
      ...clientSummary(S, t),
      assignment: a ? assignmentView(a, S, t) : null
    };
  }

  return {
    /* ---------- dashboard ---------- */
    // Roster counts, money this month, who needs renewing, how clients are training, what they logged.
    'GET /api/coach/dashboard': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const now = Date.now(), t = today(), offset = ctx.TZ_OFFSET_MIN;
      const clients = clientsOf(coach.id);
      const states = new Map(clients.map(u => [u.id, readState(u.id)]));
      const rows = clients.map(u => clientRow(u, now, t, states.get(u.id)));
      const names = new Map(clients.map(u => [u.id, u.name]));
      const n = s => rows.filter(r => r.access === s).length;
      const due = r => r.access === 'active' && r.daysLeft != null && r.daysLeft <= CLIENT_REMIND_DAYS;
      json(res, 200, {
        counts: {
          total: rows.length, active: n('active'), expired: n('expired'), paused: rows.length - n('active') - n('expired'),
          due: rows.filter(due).length, live: rows.filter(r => r.live).length
        },
        billing: coachBilling(db.ledger, coach.id, now, offset),
        earnings: coachEarningsSeries(db.ledger, coach.id, now, 6, offset),
        renewalsDue: rows.filter(r => due(r) || r.access === 'expired')
          .sort((a, b) => (a.daysLeft ?? -1e9) - (b.daysLeft ?? -1e9))
          .map(r => ({ id: r.id, name: r.name, access: r.access, daysLeft: r.daysLeft, paidUntil: r.paidUntil })),
        progress: rosterProgress(rows.map(r => ({
          access: r.access, workouts30d: r.workouts30d, lastWorkout: r.lastWorkout, onPlan: !!r.assignment, rate: r.assignment?.rate ?? null
        })), t),
        clientStats: rows.map(r => ({
          id: r.id, name: r.name, access: r.access, live: !!r.live, lastWorkout: r.lastWorkout, workouts30d: r.workouts30d,
          rate: r.assignment?.rate ?? null, planName: r.assignment?.planName || null,
          weight: r.weight, weightChange30d: r.weightChange30d, unit: r.unit
        })).sort((a, b) => b.workouts30d - a.workouts30d || a.name.localeCompare(b.name)),
        payments: db.ledger.filter(e => e.coachId === coach.id && e.type === 'client_monthly').sort(byNewest).slice(0, 8).map(e => ({
          id: e.id, clientId: e.clientId, clientName: names.get(e.clientId) || 'Deleted client',
          amount: e.amount, received: e.received ?? null, created: e.created, settled: !!e.settled
        })),
        activity: recentActivity(clients.map(u => ({ id: u.id, name: u.name, state: states.get(u.id) })), 15),
        fee: db.settings.clientMonthlyFee
      });
    },

    /* ---------- clients ---------- */
    'GET /api/coach/clients': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const now = Date.now(), t = today();
      json(res, 200, { clients: clientsOf(coach.id).map(u => clientRow(u, now, t)), fee: db.settings.clientMonthlyFee });
    },

    'GET /api/coach/client': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const u = ownClient(coach, param(req, 'id'));
      if (!u) return json(res, 404, { error: 'no such client' });
      const S = readState(u.id) || {};
      const now = Date.now(), t = today();
      const month = t.slice(0, 7);
      const prevMonth = shiftISO(month + '-01', -1).slice(0, 7);
      json(res, 200, {
        client: clientRow(u, now, t, S),
        state: {
          unit: S.unit || 'kg', body: S.body || 'male', height: S.height || null, targetW: S.targetW ?? null,
          workouts: S.workouts || [], bodyweight: S.bodyweight || [], metrics: S.metrics || [],
          measure: S.measure || [], photos: S.photos || [], routines: S.routines || [], week: S.week || {},
          customEx: S.customEx || [], effort: S.effort ?? null, lastSync: S._ts || null
        },
        metrics: bodyMetrics(S),
        assignments: db.assignments.filter(a => a.clientId === u.id).sort(byNewest).map(a => assignmentView(a, S, t)),
        payments: db.ledger.filter(e => e.clientId === u.id).sort(byNewest).map(e => ({
          id: e.id, amount: e.amount, received: e.received ?? null, periodStart: e.periodStart, periodEnd: e.periodEnd,
          created: e.created, settled: !!e.settled, note: e.note || ''
        })),
        reports: [monthlyReport(S, month), monthlyReport(S, prevMonth)],
        fee: db.settings.clientMonthlyFee
      });
    },

    'GET /api/coach/invites': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const invites = db.invites.filter(i => i.kind === 'client' && i.coachId === coach.id).map(withUsedBy)
        .sort((a, b) => String(b.created).localeCompare(String(a.created)));
      json(res, 200, { invites, fee: db.settings.clientMonthlyFee });
    },

    // One code per client. A reusable code would let anyone who saw it sign up — and every signup
    // is a monthly charge against the coach.
    'POST /api/coach/invites/new': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const invite = { code: newInviteCode(), kind: 'client', coachId: coach.id, note: clip(body.note, 80), createdBy: coach.id, created: new Date().toISOString() };
      db.invites.push(invite);
      saveDb();
      json(res, 200, { invite });
    },

    'POST /api/coach/invites/revoke': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const code = String(body.code || '').toUpperCase();
      const inv = db.invites.find(i => i.code === code && i.kind === 'client' && i.coachId === coach.id);
      if (!inv) return json(res, 404, { error: 'no such code' });
      if (inv.usedBy) return json(res, 400, { error: 'already used — cannot revoke' });
      db.invites = db.invites.filter(i => i.code !== code);
      saveDb();
      json(res, 200, { ok: true });
    },

    // Another month of access, charged to the coach. `received` is optional: what the client paid
    // the coach, recorded only so the coach's own earnings can be shown back to them.
    'POST /api/coach/client/renew': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const u = ownClient(coach, body.id);
      if (!u) return json(res, 404, { error: 'no such client' });
      const now = Date.now();
      const periodStart = Math.max(u.paidUntil || 0, now);
      u.paidUntil = extendFrom(u.paidUntil, now, CLIENT_TERM_DAYS);
      delete u.remindedFor; delete u.expiredFor;
      const received = Number.isFinite(+body.received) && +body.received > 0 ? Math.round(+body.received) : null;
      db.ledger.push({
        id: rid(), type: 'client_monthly', coachId: coach.id, clientId: u.id, amount: db.settings.clientMonthlyFee,
        ...(received ? { received } : {}), periodStart, periodEnd: u.paidUntil, created: now, recordedBy: coach.id, settled: false
      });
      saveDb();
      notify(u.id, { type: 'renewed', title: 'Access renewed', body: 'Your coach has renewed your access — keep going!', url: '#/home' });
      json(res, 200, { ok: true, client: clientRow(u, now, today()) });
    },

    'POST /api/coach/client/lock': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const u = ownClient(coach, body.id);
      if (!u) return json(res, 404, { error: 'no such client' });
      u.locked = !!body.locked;
      saveDb();
      notify(u.id, u.locked
        ? { type: 'account', title: 'Access paused', body: 'Your coach has paused your access. Contact them to continue.' }
        : { type: 'account', title: 'Access restored', body: 'Your coach has restored your access.', url: '#/home' });
      json(res, 200, { ok: true, client: clientRow(u, Date.now(), today()) });
    },

    'POST /api/coach/client/update': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const u = ownClient(coach, body.id);
      if (!u) return json(res, 404, { error: 'no such client' });
      if (body.name !== undefined) {
        const name = clip(body.name, 40);
        if (!name) return json(res, 400, { error: 'name required' });
        u.name = name;
      }
      if (body.note !== undefined) u.coachNote = clip(body.note, 1000);
      saveDb();
      json(res, 200, { ok: true, client: clientRow(u, Date.now(), today()) });
    },

    'POST /api/coach/client/delete': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const u = ownClient(coach, body.id);
      if (!u) return json(res, 404, { error: 'no such client' });
      db.users = db.users.filter(x => x.id !== u.id);
      db.creds = db.creds.filter(x => x.userId !== u.id);
      db.subs = db.subs.filter(x => x.userId !== u.id);
      db.assignments = db.assignments.filter(a => a.clientId !== u.id);
      db.notifications = db.notifications.filter(n => n.userId !== u.id);
      for (const g of db.groups) g.clientIds = g.clientIds.filter(id => id !== u.id);
      removeUserData(u.id);
      // Ledger entries stay. They record what the coach was charged, and deleting a client
      // must not quietly erase money that is owed or has been paid.
      saveDb();
      json(res, 200, { ok: true });
    },

    /* ---------- plans ---------- */
    'GET /api/coach/plans': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const plans = db.plans.filter(p => p.coachId === coach.id).sort((a, b) => b.updated - a.updated);
      json(res, 200, { plans, categories: PLAN_CATEGORIES });
    },

    'POST /api/coach/plans/save': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const name = clip(body.name, 60);
      if (!name) return json(res, 400, { error: 'Give the plan a name.' });
      const bundle = cleanBundle(body.bundle, rid);
      if (!bundle || !bundle.routines.length) return json(res, 400, { error: 'Add at least one routine.' });
      const category = PLAN_CATEGORIES.includes(body.category) ? body.category : 'Custom';
      const notes = clip(body.notes, 1000);
      const now = Date.now();
      let plan = null;
      if (body.id) {
        plan = db.plans.find(p => p.id === body.id && p.coachId === coach.id);
        if (!plan) return json(res, 404, { error: 'no such plan' });
        Object.assign(plan, { name, category, notes, bundle, updated: now });
      } else {
        plan = { id: rid(), coachId: coach.id, name, category, notes, bundle, created: now, updated: now };
        db.plans.push(plan);
      }
      saveDb();
      json(res, 200, { plan });
    },

    // Existing assignments keep their own copy of the plan, so deleting it changes nothing a
    // client has already been given.
    'POST /api/coach/plans/delete': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      if (!db.plans.some(p => p.id === body.id && p.coachId === coach.id)) return json(res, 404, { error: 'no such plan' });
      db.plans = db.plans.filter(p => p.id !== body.id);
      saveDb();
      json(res, 200, { ok: true });
    },

    /* ---------- assignment ---------- */
    // Each assignment snapshots the plan. Editing the plan afterwards must not silently change a
    // programme a client is already partway through.
    'POST /api/coach/assign': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const plan = db.plans.find(p => p.id === body.planId && p.coachId === coach.id);
      if (!plan) return json(res, 404, { error: 'no such plan' });
      let ids = Array.isArray(body.clientIds) ? body.clientIds : [];
      if (body.groupId) {
        const g = db.groups.find(x => x.id === body.groupId && x.coachId === coach.id);
        if (!g) return json(res, 404, { error: 'no such group' });
        ids = ids.concat(g.clientIds);
      }
      const clients = [...new Set(ids)].map(id => ownClient(coach, id)).filter(Boolean);
      if (!clients.length) return json(res, 400, { error: 'Pick at least one client.' });
      const start = ISO.test(body.start || '') ? body.start : today();
      const end = ISO.test(body.end || '') && body.end >= start ? body.end : null;
      const note = clip(body.note, 500);
      const now = Date.now();
      for (const u of clients) {
        db.assignments.push({
          id: rid(), coachId: coach.id, clientId: u.id, planId: plan.id, planName: plan.name,
          category: plan.category, notes: plan.notes || '', bundle: plan.bundle, week: plan.bundle.week || {},
          start, end, note, created: now
        });
        notify(u.id, { type: 'assigned', title: 'New plan from your coach', body: plan.name, url: '#/coach' }, { save: false });
      }
      saveDb();
      json(res, 200, { ok: true, count: clients.length });
    },

    'POST /api/coach/assignment/delete': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      if (!db.assignments.some(a => a.id === body.id && a.coachId === coach.id)) return json(res, 404, { error: 'no such assignment' });
      db.assignments = db.assignments.filter(a => a.id !== body.id);
      saveDb();
      json(res, 200, { ok: true });
    },

    /* ---------- groups ---------- */
    'GET /api/coach/groups': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      json(res, 200, { groups: db.groups.filter(g => g.coachId === coach.id).sort(byNewest) });
    },

    'POST /api/coach/groups/save': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      const name = clip(body.name, 40);
      if (!name) return json(res, 400, { error: 'Give the group a name.' });
      const clientIds = [...new Set(Array.isArray(body.clientIds) ? body.clientIds : [])].filter(id => ownClient(coach, id));
      let group = null;
      if (body.id) {
        group = db.groups.find(g => g.id === body.id && g.coachId === coach.id);
        if (!group) return json(res, 404, { error: 'no such group' });
        Object.assign(group, { name, clientIds });
      } else {
        group = { id: rid(), coachId: coach.id, name, clientIds, created: Date.now() };
        db.groups.push(group);
      }
      saveDb();
      json(res, 200, { group });
    },

    'POST /api/coach/groups/delete': async (req, res) => {
      const coach = requireCoach(req, res); if (!coach) return;
      const body = await readBody(req);
      if (!db.groups.some(g => g.id === body.id && g.coachId === coach.id)) return json(res, 404, { error: 'no such group' });
      db.groups = db.groups.filter(g => g.id !== body.id);
      saveDb();
      json(res, 200, { ok: true });
    }
  };
}
