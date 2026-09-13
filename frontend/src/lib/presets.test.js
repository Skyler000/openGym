import { describe, it, expect } from 'vitest'
import { PRESETS, PRESET_CATEGORIES, presetRoutines, buildPreset, presetItem, schemeOf } from './presets.js'
import { EXIDX } from './exercises.js'
import { modeOf } from './history.js'

describe('presets', () => {
  it('every exercise id exists in the library', () => {
    const missing = []
    for (const p of PRESETS) for (const r of p.routines) for (const item of r[3]) {
      if (!EXIDX[item[0]]) missing.push(`${p.key} / ${r[0]} / ${item[0]}`)
    }
    expect(missing).toEqual([])
  })

  it('keys are unique and every preset files under a known category', () => {
    expect(new Set(PRESETS.map(p => p.key)).size).toBe(PRESETS.length)
    for (const p of PRESETS) expect(PRESET_CATEGORIES).toContain(p.category)
  })

  it('every category has at least one preset', () => {
    for (const c of PRESET_CATEGORIES) expect(PRESETS.some(p => p.category === c), c).toBe(true)
  })

  it('the week only points at weekdays and at routines the preset has', () => {
    for (const p of PRESETS) for (const [day, idx] of Object.entries(p.week)) {
      expect(+day).toBeGreaterThanOrEqual(0)
      expect(+day).toBeLessThanOrEqual(6)
      expect(p.routines[idx], `${p.key} day ${day}`).toBeTruthy()
    }
  })

  it('each exercise config has what its logging mode needs', () => {
    for (const p of PRESETS) for (const r of presetRoutines(p)) for (const e of r.ex) {
      const where = `${p.key} / ${r.name} / ${e.id}`
      const mode = modeOf(e)
      expect(e.sets, where).toBeGreaterThan(0)
      if (mode === 'cardio') expect(e.min, where).toBeGreaterThan(0)
      else if (mode === 'time') expect(e.sec, where).toBeGreaterThan(0)
      else expect(e.reps, where).toBeGreaterThan(0)
    }
  })

  // demoSeed.js seeds its example history against these routines, so their shape must not drift.
  it('keeps the Push/Pull/Legs routines in exactly the shape the demo history is seeded against', () => {
    const [push, pull, legs] = presetRoutines(PRESETS.find(p => p.key === 'ppl'))
    expect(push.ex[0]).toEqual({ id: '0025', sets: 4, reps: 8, weight: 0 })
    expect(pull.ex.map(e => e.id)).toEqual(['2330', '0027', '1323', '0031', '0313'])
    expect(legs.ex).toHaveLength(6)
    expect(push.prog).toBeUndefined()
  })

  it('buildPreset maps weekdays onto the fresh routine ids', () => {
    for (const p of PRESETS) {
      const b = buildPreset(p.key)
      expect(Object.values(b.week).every(id => b.routines.some(r => r.id === id)), p.key).toBe(true)
    }
  })

  it('schemeOf labels sets of reps, holds and cardio', () => {
    expect(schemeOf(presetItem(['0025', 5, 5]))).toBe('5 × 5')
    expect(schemeOf({ sets: 4, mode: 'time', sec: 30 })).toBe('4 × 30s')
    expect(schemeOf({ sets: 2, mode: 'time', sec: 90 })).toBe('2 × 1:30')
    expect(schemeOf({ sets: 1, min: 25, speed: 8 })).toBe('25 min')
    expect(schemeOf({ sets: 6, min: 3, speed: 22 })).toBe('6 × 3 min')
  })
})
