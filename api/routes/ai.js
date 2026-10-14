// AI features. Phase 1: generate a workout plan a coach can review and save. The model only ever picks
// from the exercises the app sends (the coach's own catalogue), and its output is rebuilt field by
// field (toPlan) and sanitised (cleanBundle) exactly like a hand-made plan before it goes anywhere.
import { PLAN_CATEGORIES, cleanBundle } from './coach.js';
import { route } from '../lib/airoute.js';
import { toolCall } from '../lib/ai.js';
import { PLAN_TOOL, systemPrompt, userMessage, toPlan } from '../lib/aiplan.js';

const MAX_CANDIDATES = 240;

export default function aiRoutes(ctx) {
  const { json, readBody, requireRole, rid } = ctx;
  const apiKey = process.env.ANTHROPIC_API_KEY || '';

  return {
    // Generate a plan draft. Returns it unsaved — the coach reviews and saves through the normal path.
    'POST /api/ai/plan': async (req, res) => {
      const coach = requireRole(req, res, 'coach'); if (!coach) return;
      if (!apiKey) return json(res, 503, { error: 'AI is not set up on this server.' });
      const body = await readBody(req);

      const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
        .filter(c => c && typeof c.id === 'string' && c.id)
        .slice(0, MAX_CANDIDATES)
        .map(c => ({ id: String(c.id).slice(0, 40), n: String(c.n || '').slice(0, 60), bp: String(c.bp || '').slice(0, 20), tg: String(c.tg || '').slice(0, 20), eq: String(c.eq || '').slice(0, 24) }));
      if (candidates.length < 5) return json(res, 400, { error: 'Not enough exercises to choose from.' });

      const reqData = {
        goal: body.goal, experience: body.experience, equipment: body.equipment, focus: body.focus, notes: body.notes,
        perWeek: Math.max(1, Math.min(7, Math.round(+body.perWeek || 3)))
      };
      const r = route('plan');
      try {
        const { input, usage } = await toolCall({
          apiKey, model: r.model, maxTokens: r.max_tokens,
          system: systemPrompt(reqData, candidates),
          messages: [{ role: 'user', content: userMessage(reqData) }],
          tool: PLAN_TOOL
        });
        const plan = toPlan(input, { validIds: new Set(candidates.map(c => c.id)), rid });
        if (plan.error) return json(res, 502, { error: plan.error });
        const bundle = cleanBundle(plan.bundle, rid);
        if (!bundle || !bundle.routines.length) return json(res, 502, { error: 'The AI plan could not be built.' });
        console.log(`ai/plan ${r.model} in=${usage.input_tokens || 0} out=${usage.output_tokens || 0} cacheRead=${usage.cache_read_input_tokens || 0}`);
        json(res, 200, { plan: { name: plan.name, category: plan.category, notes: plan.notes, bundle }, model: r.model });
      } catch (e) {
        // A 4xx from the API is a bad request on our side; anything else is an upstream failure.
        json(res, e.status && e.status >= 400 && e.status < 500 ? 400 : 502, { error: e.message || 'The AI request failed.' });
      }
    }
  };
}
