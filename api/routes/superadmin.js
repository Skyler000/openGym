// Super admin: the platform owner. Creates coaches (by invite), records what they pay, settles
// what they owe for their clients, and can lock, suspend or disable any coach.
import { extendFrom, daysLeft, COACH_TERM_DAYS } from '../lib/access.js';
import { coachBilling, settle } from '../lib/billing.js';
import { isoDay } from '../lib/time.js';

const MAX_FEE = 10000000;

// Status changes are flags on the coach record. Access is derived from these flags on every
// request, so nothing else — least of all the coach's clients — has to be updated in step.
// A disabled coach cannot sign in to read a notification, so disabling sends none.
const ACTIONS = {
  enable:        { set: { disabled: false } },
  disable:       { set: { disabled: true } },
  lock:          { set: { locked: true }, note: ['Account locked', 'Your coach account has been locked by the platform administrator.'] },
  unlock:        { set: { locked: false }, note: ['Account unlocked', 'Your coach account is active again.'] },
  suspend:       { set: { suspended: true }, note: ['Account suspended', 'Your coach account has been suspended by the platform administrator.'] },
  unsuspend:     { set: { suspended: false }, note: ['Suspension lifted', 'Your coach account is active again.'] },
  lockClients:   { set: { clientsLocked: true }, note: ['Clients paused', 'The platform administrator has paused access for all of your clients.'] },
  unlockClients: { set: { clientsLocked: false }, note: ['Clients restored', 'Your clients have access again.'] }
};

export default function superadminRoutes(ctx) {
  const { db, json, readBody, saveDb, requireRole, role, access, userById, notify, rid, newInviteCode, removeUserData, TZ_OFFSET_MIN } = ctx;
  const requireAdmin = (req, res) => requireRole(req, res, 'superadmin');
  const param = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);
  const clientsOf = id => db.users.filter(u => role(u) === 'client' && u.coachId === id);
  const findCoach = id => { const c = userById(id); return c && role(c) === 'coach' ? c : null; };
  const withUsedBy = i => ({ ...i, usedByName: i.usedBy ? (userById(i.usedBy) || {}).name || null : null });

  function coachRow(c, now) {
    const states = clientsOf(c.id).map(access);
    const count = s => states.filter(a => a === s).length;
    return {
      id: c.id, name: c.name, created: c.created || null,
      access: access(c), paidUntil: c.paidUntil || null, daysLeft: daysLeft(c.paidUntil, now),
      locked: !!c.locked, suspended: !!c.suspended, disabled: !!c.disabled, clientsLocked: !!c.clientsLocked,
      clients: { total: states.length, active: count('active'), expired: count('expired'), locked: count('locked') },
      billing: coachBilling(db.ledger, c.id, now, TZ_OFFSET_MIN)
    };
  }

  return {
    'GET /api/sa/coaches': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const now = Date.now();
      json(res, 200, { coaches: db.users.filter(u => role(u) === 'coach').map(c => coachRow(c, now)), settings: db.settings });
    },

    'GET /api/sa/coach': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const c = findCoach(param(req, 'id'));
      if (!c) return json(res, 404, { error: 'no such coach' });
      const now = Date.now();
      json(res, 200, {
        coach: coachRow(c, now),
        clients: clientsOf(c.id).map(u => ({
          id: u.id, name: u.name, created: u.created || null,
          access: access(u), paidUntil: u.paidUntil || null, daysLeft: daysLeft(u.paidUntil, now), locked: !!u.locked
        })),
        ledger: db.ledger.filter(e => e.coachId === c.id).sort((a, b) => b.created - a.created),
        settings: db.settings
      });
    },

    'GET /api/sa/invites': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const invites = db.invites.filter(i => i.kind === 'coach').map(withUsedBy)
        .sort((a, b) => String(b.created).localeCompare(String(a.created)));
      json(res, 200, { invites });
    },

    // "Create a coach" is an invite: a passkey can only be made by the person who will hold it.
    // `prepaid` (the default) records the first annual fee the moment the invite is redeemed.
    'POST /api/sa/coaches/invite': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const invite = {
        code: newInviteCode(), kind: 'coach', note: String(body.note || '').trim().slice(0, 80),
        prepaid: body.prepaid !== false, createdBy: admin.id, created: new Date().toISOString()
      };
      db.invites.push(invite);
      saveDb();
      json(res, 200, { invite });
    },

    'POST /api/sa/invites/revoke': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const code = String(body.code || '').toUpperCase();
      const inv = db.invites.find(i => i.code === code && i.kind === 'coach');
      if (!inv) return json(res, 404, { error: 'no such code' });
      if (inv.usedBy) return json(res, 400, { error: 'already used — cannot revoke' });
      db.invites = db.invites.filter(i => i.code !== code);
      saveDb();
      json(res, 200, { ok: true });
    },

    'POST /api/sa/coach/update': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const c = findCoach(body.id);
      if (!c) return json(res, 404, { error: 'no such coach' });
      const name = String(body.name || '').trim().slice(0, 40);
      if (!name) return json(res, 400, { error: 'name required' });
      c.name = name;
      saveDb();
      json(res, 200, { ok: true, coach: coachRow(c, Date.now()) });
    },

    'POST /api/sa/coach/status': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const c = findCoach(body.id);
      if (!c) return json(res, 404, { error: 'no such coach' });
      const action = ACTIONS[body.action];
      if (!action) return json(res, 400, { error: 'unknown action' });
      Object.assign(c, action.set);
      saveDb();
      if (action.note) notify(c.id, { type: 'account', title: action.note[0], body: action.note[1] });
      json(res, 200, { ok: true, coach: coachRow(c, Date.now()) });
    },

    // One year of access, counted from the current expiry when paying before it runs out.
    'POST /api/sa/coach/payment': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const c = findCoach(body.id);
      if (!c) return json(res, 404, { error: 'no such coach' });
      const amount = Number.isFinite(+body.amount) && +body.amount > 0 ? Math.round(+body.amount) : db.settings.coachAnnualFee;
      const now = Date.now();
      const periodStart = Math.max(c.paidUntil || 0, now);
      c.paidUntil = extendFrom(c.paidUntil, now, COACH_TERM_DAYS);
      delete c.remindedFor; delete c.expiredFor;
      db.ledger.push({
        id: rid(), type: 'coach_annual', coachId: c.id, amount, periodStart, periodEnd: c.paidUntil,
        created: now, recordedBy: admin.id, settled: true, settledAt: now, note: String(body.note || '').trim().slice(0, 120)
      });
      saveDb();
      notify(c.id, { type: 'renewed', title: 'Subscription renewed', body: `Your coach subscription is active until ${isoDay(c.paidUntil, TZ_OFFSET_MIN)}.` });
      json(res, 200, { ok: true, coach: coachRow(c, now) });
    },

    // The coach has paid over what they owe for client renewals.
    'POST /api/sa/coach/settle': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const c = findCoach(body.id);
      if (!c) return json(res, 404, { error: 'no such coach' });
      const result = settle(db.ledger, c.id, Date.now(), admin.id);
      if (result.count) saveDb();
      json(res, 200, { ok: true, ...result });
    },

    'POST /api/sa/coach/delete': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const c = findCoach(body.id);
      if (!c) return json(res, 404, { error: 'no such coach' });
      // Deleting a coach would strand their clients: no plans, and no one who can renew them.
      if (clientsOf(c.id).length) {
        return json(res, 400, { error: 'This coach still has clients. Disable the account instead, or have the coach remove their clients first.' });
      }
      db.users = db.users.filter(u => u.id !== c.id);
      db.creds = db.creds.filter(x => x.userId !== c.id);
      db.subs = db.subs.filter(x => x.userId !== c.id);
      db.plans = db.plans.filter(p => p.coachId !== c.id);
      db.groups = db.groups.filter(g => g.coachId !== c.id);
      db.invites = db.invites.filter(i => !(i.kind === 'client' && i.coachId === c.id && !i.usedBy));
      db.notifications = db.notifications.filter(n => n.userId !== c.id);
      removeUserData(c.id);
      // The coach's ledger entries are kept: they are the record of what was paid.
      saveDb();
      json(res, 200, { ok: true });
    },

    'GET /api/sa/settings': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      json(res, 200, { settings: db.settings });
    },

    // New fees apply from the next payment or renewal. Every ledger entry keeps the amount it was
    // recorded with, so changing a fee never rewrites what anyone has already been charged.
    'POST /api/sa/settings': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const next = { ...db.settings };
      for (const k of ['coachAnnualFee', 'clientMonthlyFee']) {
        if (body[k] === undefined) continue;
        const v = Math.round(+body[k]);
        if (!Number.isFinite(v) || v < 0 || v > MAX_FEE) return json(res, 400, { error: `${k} must be a whole number from 0 to ${MAX_FEE}` });
        next[k] = v;
      }
      db.settings = next;
      saveDb();
      json(res, 200, { settings: db.settings });
    }
  };
}
