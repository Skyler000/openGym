import { describe, it, expect } from 'vitest'
import { searchExercises, queryTokens } from './exsearch.js'

// A small fixture shaped like the real dataset (n, bp, tg, eq, sm), so the rules are deterministic.
const EX = [
  { id: '1', n: 'Barbell Bench Press', bp: 'chest', tg: 'pectorals', eq: 'barbell', sm: ['triceps', 'delts'] },
  { id: '2', n: 'Dumbbell Bench Press', bp: 'chest', tg: 'pectorals', eq: 'dumbbell', sm: ['triceps'] },
  { id: '3', n: 'Incline Dumbbell Curl', bp: 'upper arms', tg: 'biceps', eq: 'dumbbell', sm: [] },
  { id: '4', n: 'Barbell Curl', bp: 'upper arms', tg: 'biceps', eq: 'barbell', sm: [] },
  { id: '5', n: 'Back Squat', bp: 'upper legs', tg: 'quads', eq: 'barbell', sm: ['glutes'] },
  { id: '6', n: 'Crunch', bp: 'waist', tg: 'abs', eq: 'body weight', sm: [] },
  { id: '7', n: 'Treadmill Run', bp: 'cardio', tg: 'cardiovascular system', eq: 'leverage machine', sm: [] },
  { id: '8', n: 'Lat Pulldown', bp: 'back', tg: 'lats', eq: 'cable', sm: ['biceps'] },
  { id: '9', n: 'Calf Raise', bp: 'lower legs', tg: 'calves', eq: 'body weight', sm: [] }
]
const names = q => searchExercises(EX, q).map(e => e.n)
const set = q => new Set(names(q))

describe('smart exercise search', () => {
  it('an empty query returns the list unchanged', () => {
    expect(searchExercises(EX, '')).toBe(EX)
    expect(searchExercises(EX, '   ')).toBe(EX)
    expect(queryTokens('  the best chest workout ')).toEqual(['chest'])   // stopwords dropped
  })

  it('matches names regardless of word order', () => {
    expect(set('bench')).toEqual(new Set(['Barbell Bench Press', 'Dumbbell Bench Press']))
    expect(set('bench press')).toEqual(new Set(['Barbell Bench Press', 'Dumbbell Bench Press']))
    expect(set('press bench')).toEqual(new Set(['Barbell Bench Press', 'Dumbbell Bench Press']))
  })

  it('requires every word to match, so "dumbbell curl" excludes barbell curls and dumbbell presses', () => {
    expect(names('dumbbell curl')).toEqual(['Incline Dumbbell Curl'])
  })

  it('understands gym slang via synonyms', () => {
    expect(set('pecs')).toEqual(new Set(['Barbell Bench Press', 'Dumbbell Bench Press']))
    expect(names('abs')).toEqual(['Crunch'])
    expect(names('core')).toEqual(['Crunch'])
    expect(set('legs')).toEqual(new Set(['Back Squat', 'Calf Raise']))
    expect(set('bodyweight')).toEqual(new Set(['Crunch', 'Calf Raise']))
    expect(set('db')).toEqual(new Set(['Dumbbell Bench Press', 'Incline Dumbbell Curl']))
    expect(names('lats')).toEqual(['Lat Pulldown'])
    expect(names('quads')).toEqual(['Back Squat'])
    expect(names('cardio')).toEqual(['Treadmill Run'])
    expect(names('run')).toEqual(['Treadmill Run'])
  })

  it('finds exercises by a muscle they only work secondarily', () => {
    expect(set('triceps')).toEqual(new Set(['Barbell Bench Press', 'Dumbbell Bench Press']))
  })

  it('tolerates small typos', () => {
    expect(set('benh press')).toEqual(new Set(['Barbell Bench Press', 'Dumbbell Bench Press']))
    expect(names('squt')).toEqual(['Back Squat'])
  })

  it('handles singular/plural either way', () => {
    expect(set('curls')).toEqual(new Set(['Incline Dumbbell Curl', 'Barbell Curl']))
    expect(names('calf')).toEqual(['Calf Raise'])
    expect(names('calves')).toEqual(['Calf Raise'])
  })

  it('ranks the most relevant first', () => {
    expect(names('squat')[0]).toBe('Back Squat')          // exact name word
    expect(names('curl')[0]).toBe('Barbell Curl')         // same score, shorter/more specific name first
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(names('xyzzy')).toEqual([])
  })
})
