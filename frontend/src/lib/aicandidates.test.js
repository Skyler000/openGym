import { describe, it, expect } from 'vitest'
import { buildCandidates } from './aicandidates.js'

const L = [
  { id: '0025', n: 'bench press', bp: 'chest', tg: 'pectorals', eq: 'barbell', st: ['...'] },
  { id: '0100', n: 'db curl', bp: 'upper arms', tg: 'biceps', eq: 'dumbbell' },
  { id: 'f0001', n: '90/90 hamstring', bp: 'upper legs', tg: 'hamstrings', eq: 'body weight' },
  { id: '0200', n: 'treadmill run', bp: 'cardio', tg: 'cardiovascular system', eq: 'machine' }
]

describe('buildCandidates', () => {
  it('drops cardio and projects only the fields the planner needs', () => {
    const out = buildCandidates(L)
    expect(out.map(e => e.id)).toEqual(['0025', '0100', 'f0001'])   // no cardio
    expect(out[0]).toEqual({ id: '0025', n: 'bench press', bp: 'chest', tg: 'pectorals', eq: 'barbell' }) // no st
  })

  it('lists animated exercises before the imported (f-prefixed) ones', () => {
    const out = buildCandidates(L)
    expect(out[out.length - 1].id).toBe('f0001')
  })

  it('filters to the chosen equipment', () => {
    expect(buildCandidates(L, { equipment: ['dumbbell'] }).map(e => e.id)).toEqual(['0100'])
    expect(buildCandidates(L, { equipment: ['barbell', 'body weight'] }).map(e => e.id)).toEqual(['0025', 'f0001'])
  })

  it('caps the list', () => {
    expect(buildCandidates(L, { limit: 2 }).length).toBe(2)
  })

  it('handles an empty or missing list', () => {
    expect(buildCandidates([])).toEqual([])
    expect(buildCandidates(undefined)).toEqual([])
  })
})
