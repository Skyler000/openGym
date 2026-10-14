// The exercises offered to the AI planner. The model may only choose from this list, so it decides
// the plan's whole vocabulary: animated exercises first (richer for the client), then the static
// imports, filtered to the equipment the coach picked. Cardio is left out of strength planning.
// Pure, so the selection is unit-tested.
export function buildCandidates(list, { equipment = [], limit = 200 } = {}) {
  const eq = equipment.length ? new Set(equipment) : null
  const pool = (list || []).filter(e => e.bp !== 'cardio' && (!eq || eq.has(e.eq)))
  const animated = pool.filter(e => /^[0-9]/.test(e.id))
  const imported = pool.filter(e => !/^[0-9]/.test(e.id))
  return [...animated, ...imported].slice(0, limit).map(e => ({ id: e.id, n: e.n, bp: e.bp, tg: e.tg, eq: e.eq }))
}
