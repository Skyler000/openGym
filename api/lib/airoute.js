// Picks the Claude model and reasoning effort for each AI task, so cheap tasks don't pay Sonnet/Opus
// prices. Pure and declarative — the whole policy is the ROUTES table. Model ids are overridable by
// env, so the lineup can be upgraded without a code change.
const TIERS = {
  haiku: process.env.AI_MODEL_HAIKU || 'claude-haiku-4-5-20251001',
  sonnet: process.env.AI_MODEL_SONNET || 'claude-sonnet-5',
  opus: process.env.AI_MODEL_OPUS || 'claude-opus-5'
}
// tier: which model. effort: reasoning depth (low|medium|high) — the second cost lever. max: token cap.
const ROUTES = {
  extract: { tier: 'haiku', effort: 'low', max: 400 },      // parse a coach's free text into fields
  summary: { tier: 'haiku', effort: 'low', max: 700 },      // a client's monthly progress review
  chat: { tier: 'haiku', effort: 'medium', max: 700 },      // client Q&A — escalates to sonnet when hard
  plan: { tier: 'sonnet', effort: 'medium', max: 3000 },    // generate a workout plan
  periodize: { tier: 'opus', effort: 'high', max: 4000 }    // rare: multi-week / injury-adapted programming
}

export function route(task, { escalate = false } = {}) {
  const r = ROUTES[task] || ROUTES.plan
  const hard = task === 'chat' && escalate
  const tier = hard ? 'sonnet' : r.tier
  return { model: TIERS[tier], tier, effort: hard ? 'medium' : r.effort, max_tokens: r.max }
}

export const TASKS = Object.keys(ROUTES)
