// Client: sees the plans their coach assigned and records when one was added to their planner.
// The client's own training, weigh-ins, measurements and photos live in their synced state, which
// is why there is so little here — the coach reads that state directly (routes/coach.js).
import { compliance } from '../lib/stats.js';

export default function clientRoutes(ctx) {
  const { db, json, readBody, saveDb, requireRole, readState, userById, today } = ctx;
  const requireClient = (req, res) => requireRole(req, res, 'client');

  return {
    'GET /api/client/assignments': async (req, res) => {
      const me = requireClient(req, res); if (!me) return;
      const S = readState(me.id);
      const t = today();
      const assignments = db.assignments.filter(a => a.clientId === me.id).sort((a, b) => b.created - a.created)
        .map(a => ({
          id: a.id, planName: a.planName, category: a.category || null, notes: a.notes || '', note: a.note || '',
          start: a.start, end: a.end || null, bundle: a.bundle, created: a.created, addedAt: a.addedAt || null,
          ...compliance(S, a, t)
        }));
      const coach = userById(me.coachId);
      json(res, 200, { assignments, coach: coach ? { id: coach.id, name: coach.name } : null });
    },

    'POST /api/client/assignment/added': async (req, res) => {
      const me = requireClient(req, res); if (!me) return;
      const body = await readBody(req);
      const a = db.assignments.find(x => x.id === body.id && x.clientId === me.id);
      if (!a) return json(res, 404, { error: 'no such plan' });
      a.addedAt = Date.now();
      saveDb();
      json(res, 200, { ok: true });
    }
  };
}
