import { describe, it, expect } from 'vitest'
import { buildPlanBundle, parsePlan, mergePlan, dedupeAiCustoms } from './plan-share.js'

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

// An AI plan can invent exercises the model couldn't see in its slice of the library. Any that really
// exist in the catalogue get folded back onto the real one before the plan is saved.
describe('dedupeAiCustoms', () => {
  const match = name => (name.toLowerCase() === 'bench press' ? { id: '0025', n: 'bench press' } : null)

  it('rewrites routine refs to the real id and drops the reinvented custom', () => {
    const bundle = {
      routines: [{ id: 'r1', ex: [{ id: 'cx1', sets: 3, reps: 8 }, { id: 'cx2', sets: 3, reps: 10 }] }],
      week: { 1: 'r1' },
      customEx: [{ id: 'cx1', n: 'Bench Press', bp: 'chest' }, { id: 'cx2', n: 'Nordic Curl', bp: 'upper legs' }]
    }
    const out = dedupeAiCustoms(bundle, match)
    expect(out.customEx).toEqual([{ id: 'cx2', n: 'Nordic Curl', bp: 'upper legs' }])   // real one dropped
    expect(out.routines[0].ex.map(e => e.id)).toEqual(['0025', 'cx2'])                  // ref rewritten
  })

  it('collapses a ref that remaps onto an exercise already in the routine', () => {
    const bundle = {
      routines: [{ id: 'r1', ex: [{ id: '0025', sets: 3, reps: 5 }, { id: 'cx1', sets: 3, reps: 8 }] }],
      customEx: [{ id: 'cx1', n: 'Bench Press', bp: 'chest' }]
    }
    const out = dedupeAiCustoms(bundle, match)
    expect(out.routines[0].ex.map(e => e.id)).toEqual(['0025'])   // no duplicate entry
    expect(out.customEx).toEqual([])
  })

  it('leaves a bundle with no catalogue matches untouched', () => {
    const bundle = { routines: [{ id: 'r1', ex: [{ id: 'cx1', sets: 3, reps: 8 }] }], customEx: [{ id: 'cx1', n: 'Nordic Curl', bp: 'upper legs' }] }
    expect(dedupeAiCustoms(bundle, match)).toBe(bundle)
  })
})
