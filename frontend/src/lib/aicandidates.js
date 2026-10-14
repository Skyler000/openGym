// The catalogue exercises offered to the AI planner as its preferred vocabulary: animated exercises
// first (richer for the client), then the static imports, filtered to the equipment the coach picked.
// Cardio is left out of strength planning. The model reuses these where they fit and invents the rest.
// Pure, so the selection is unit-tested.
export function buildCandidates(list, { equipment = [], limit = 200 } = {}) {
  const eq = equipment.length ? new Set(equipment) : null
  const pool = (list || []).filter(e => e.bp !== 'cardio' && (!eq || eq.has(e.eq)))
  const animated = pool.filter(e => /^[0-9]/.test(e.id))
  const imported = pool.filter(e => !/^[0-9]/.test(e.id))
  return [...animated, ...imported].slice(0, limit).map(e => ({ id: e.id, n: e.n, bp: e.bp, tg: e.tg, eq: e.eq }))
}
