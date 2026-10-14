// Turns an AI plan request into a prompt, and the model's tool output back into a WinterARC plan
// bundle. Pure, so the prompt shape and the (safety-critical) parsing are unit-tested without a key.
// The model may only use exercise ids it was given; anything else is dropped here, before cleanBundle.
import { PLAN_CATEGORIES } from '../routes/coach.js';

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const clipInt = (v, lo, hi, d) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };

// The exercises the model picks from, as compact tab-separated lines.
export function candidateLines(candidates) {
  return candidates.map(c => `${c.id}\t${clip(c.n, 60)}\t${clip(c.bp, 20)}\t${clip(c.tg, 20)}\t${clip(c.eq, 24)}`).join('\n');
}

export const PLAN_TOOL = {
  name: 'create_plan',
  description: 'Return a structured weekly training plan built only from the provided exercise list.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short plan name' },
      category: { type: 'string', enum: PLAN_CATEGORIES },
      notes: { type: 'string', description: 'One or two sentences of guidance for the client' },
      routines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'An exercise id taken exactly from the provided list' },
                  sets: { type: 'integer' }, reps: { type: 'integer' },
                  rest: { type: 'integer', description: 'Rest between sets, in seconds' },
                  note: { type: 'string', description: 'Optional cue' }
                },
                required: ['id', 'sets', 'reps']
              }
            }
          },
          required: ['name', 'exercises']
        }
      },
      week: { type: 'object', description: 'Map weekday (0=Sunday .. 6=Saturday) to a routine index (0-based)', additionalProperties: { type: 'integer' } }
    },
    required: ['name', 'category', 'routines', 'week']
  }
};

// System prompt: instructions (small, uncached) + the exercise list (large, cached).
export function systemPrompt(req, candidates) {
  const instructions =
`You are a strength & conditioning assistant inside a coaching app. Design a weekly workout plan for one client, then return it by calling the create_plan tool. Rules:
- Use ONLY exercises from the list below, referenced by their exact id. Never invent ids or names.
- Build exactly ${req.perWeek} training day(s) per week and map them onto weekdays in "week".
- Choose sets, reps and rest that fit the goal and experience; put compound lifts first.
- Keep each routine focused (about 4-7 exercises). Name each routine briefly (1-4 words), e.g. "Push", "Pull", "Legs" or "Upper Body" — not a long description. Give the plan a short name and a sentence or two of notes.
- This is general fitness guidance, not medical advice.`;
  return [
    { type: 'text', text: instructions },
    { type: 'text', text: `Exercise list (id<TAB>name<TAB>body part<TAB>target<TAB>equipment):\n${candidateLines(candidates)}`, cache_control: { type: 'ephemeral' } }
  ];
}

export function userMessage(req) {
  return [
    `Goal: ${clip(req.goal, 200) || 'general fitness'}`,
    `Experience: ${clip(req.experience, 40) || 'intermediate'}`,
    `Days per week: ${req.perWeek}`,
    req.equipment ? `Equipment available: ${clip(req.equipment, 200)}` : null,
    req.focus ? `Focus: ${clip(req.focus, 200)}` : null,
    req.notes ? `Extra notes: ${clip(req.notes, 400)}` : null
  ].filter(Boolean).join('\n');
}

// Convert the tool output to { name, category, notes, bundle }. Exercises whose id wasn't offered are
// dropped; empty routines are dropped; the week is mapped onto the surviving routines by original index.
export function toPlan(input, { validIds, rid }) {
  if (!input || !Array.isArray(input.routines)) return { error: 'The AI returned an unusable plan.' };
  const routines = [];
  const byOrig = {};
  input.routines.slice(0, 14).forEach((r, oi) => {
    const ex = (Array.isArray(r && r.exercises) ? r.exercises : [])
      .filter(e => e && validIds.has(e.id)).slice(0, 40)
      .map(e => {
        const o = { id: e.id, sets: clipInt(e.sets, 1, 12, 3), reps: clipInt(e.reps, 1, 100, 10) };
        if (e.rest != null) o.rest = clipInt(e.rest, 0, 600, 90);
        const note = clip(e.note, 200); if (note) o.note = note;
        return o;
      });
    if (ex.length) { const rr = { id: rid(), name: clip(r.name, 60) || 'Routine', ex }; routines.push(rr); byOrig[oi] = rr; }
  });
  if (!routines.length) return { error: 'The AI plan had no valid exercises.' };
  const week = {};
  for (const [d, idx] of Object.entries(input.week || {})) {
    if (/^[0-6]$/.test(String(d)) && byOrig[idx]) week[d] = byOrig[idx].id;
  }
  return {
    name: clip(input.name, 60) || 'AI plan',
    category: PLAN_CATEGORIES.includes(input.category) ? input.category : 'Custom',
    notes: clip(input.notes, 1000),
    bundle: { opengym_plan: 1, routines, week, customEx: [] }
  };
}
