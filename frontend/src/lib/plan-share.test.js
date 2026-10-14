import { describe, it, expect } from 'vitest'
import { buildPlanBundle, parsePlan, mergePlan } from './plan-share.js'

// A custom exercise's target muscle has to travel with a shared/assigned plan, or the muscle map and
// volume on the receiving device fall back to the body part and read less precisely.
describe('custom exercise metadata survives a plan round-trip', () => {
  it('buildPlanBundle keeps the target muscle on a custom exercise', () => {
    const S = {
      routines: [{ id: 'r1', name: 'Day', emoji: '💪', ex: [{ id: 'cx', sets: 3, reps: 10 }] }],
      customEx: [{ id: 'cx', n: 'Sled Push', bp: 'upper legs', tg: 'quads', custom: true }],
      week: { 1: 'r1' }
    }
    expect(buildPlanBundle(S, 'Legs').customEx).toEqual([{ id: 'cx', n: 'Sled Push', bp: 'upper legs', tg: 'quads' }])
  })

  it('mergePlan carries the target muscle into the receiving state and re-ids cleanly', () => {
    const bundle = parsePlan({
      opengym_plan: 1, name: 'Legs', week: { 1: 'r1' },
      routines: [{ id: 'r1', name: 'Day', ex: [{ id: 'cx', sets: 3, reps: 10 }] }],
      customEx: [{ id: 'cx', n: 'Sled Push', bp: 'upper legs', tg: 'quads' }]
    })
    const s = { routines: [], customEx: [], week: {} }
    mergePlan(s, bundle, { schedule: true })
    expect(s.customEx[0]).toMatchObject({ n: 'Sled Push', bp: 'upper legs', tg: 'quads' })
    expect(s.routines[0].ex[0].id).toBe(s.customEx[0].id)   // routine points at the newly-id'd custom
    expect(s.week[1]).toBe(s.routines[0].id)
  })
})
