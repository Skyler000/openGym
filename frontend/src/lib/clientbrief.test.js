import { describe, it, expect } from 'vitest'
import { buildClientBrief, briefText } from './clientbrief.js'

const now = Date.parse('2026-02-01T00:00:00Z')   // fixed clock; window = last 6 weeks (from 2025-12-21)

const S = {
  unit: 'kg',
  workouts: [
    { d: '2025-11-01', entries: [{ id: '0025', sets: [{ w: 50, r: 8, done: true }] }] },          // outside the window
    { d: '2026-01-05', entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 7, done: true }] }, { id: '0043', sets: [{ w: 80, r: 5, done: true }] }] },
    { d: '2026-01-19', entries: [{ id: '0025', sets: [{ w: 65, r: 8, done: true }] }, { id: '0043', sets: [{ w: 80, r: 5, done: true }] }] },
    { d: '2026-01-26', entries: [{ id: '0025', sets: [{ w: 62, r: 8, done: true }] }] }
  ],
  bodyweight: [{ d: '2025-12-25', w: 80 }, { d: '2026-01-20', w: 78 }],
  routines: [{ id: 'r1', name: 'Upper', ex: [] }, { id: 'r2', name: 'Lower', ex: [] }],
  week: { 1: 'r1', 3: 'r2' }
}

describe('buildClientBrief', () => {
  const b = buildClientBrief(S, { now })

  it('counts only sessions inside the window and measures consistency', () => {
    expect(b.consistency.sessions).toBe(3)            // the Nov session is excluded
    expect(b.consistency.perWeek).toBe(0.5)           // 3 sessions / 6 weeks
    expect(b.consistency.weeksTrained).toBe(3)
    expect(b.consistency.daysSinceLast).toBe(6)       // last workout 2026-01-26
  })

  it('tracks bodyweight change across the window', () => {
    expect(b.bodyweight).toEqual({ now: 78, change: -2 })
  })

  it('ranks the most-trained lifts with best, last and trend', () => {
    expect(b.lifts[0]).toMatchObject({ id: '0025', sets: 4, best: 65, last: 62, trend: 'up' })   // 60 → 62 across window
    expect(b.lifts[1]).toMatchObject({ id: '0043', sets: 2, best: 80, last: 80, trend: 'flat' })
    expect(b.lifts[0].name).toMatch(/bench/i)
  })

  it('totals tonnage per week, oldest first', () => {
    expect(b.volumeByWeek.map(v => v.volume)).toEqual([1300, 920, 496])
  })

  it('reports worked and neglected muscles and the current plan', () => {
    expect(b.muscles.worked.length).toBeGreaterThan(0)
    expect(b.muscles.missed.length).toBeGreaterThan(0)
    expect(b.plan.routines).toEqual(['Upper', 'Lower'])
    expect(b.plan.week).toEqual({ 1: 'Upper', 3: 'Lower' })
  })

  it('renders a compact text brief', () => {
    const txt = briefText(b)
    expect(txt).toMatch(/3 sessions/)
    expect(txt).toContain('best 65kg')
  })
})

describe('buildClientBrief on an empty client', () => {
  it('returns safe defaults without throwing', () => {
    const b = buildClientBrief({}, { now })
    expect(b.consistency.sessions).toBe(0)
    expect(b.lifts).toEqual([])
    expect(b.bodyweight).toBeNull()
    expect(b.volumeByWeek).toEqual([])
    expect(b.unit).toBe('kg')
  })
})
