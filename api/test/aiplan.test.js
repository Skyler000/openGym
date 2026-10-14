import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPlan, candidateLines, userMessage, systemPrompt, PLAN_TOOL } from '../lib/aiplan.js'

let n = 0
const rid = () => 'r' + (++n)
const C = [
  { id: '0025', n: 'bench press', bp: 'chest', tg: 'pectorals', eq: 'barbell' },
  { id: '0043', n: 'squat', bp: 'upper legs', tg: 'quads', eq: 'barbell' }
]

test('toPlan keeps only offered exercise ids and maps the week to surviving routines', () => {
  n = 0
  const input = {
    name: 'PPL', category: 'Muscle Building', notes: 'go',
    routines: [
      { name: 'Day A', exercises: [{ id: '0025', sets: 4, reps: 8, rest: 120 }, { id: 'FAKE', sets: 3, reps: 5 }] },
      { name: 'Empty', exercises: [{ id: 'NOPE', sets: 3, reps: 5 }] }
    ],
    week: { 1: 0, 3: 1, 5: 0 }
  }
  const p = toPlan(input, { validIds: new Set(['0025', '0043']), rid })
  assert.equal(p.name, 'PPL')
  assert.equal(p.category, 'Muscle Building')
  assert.equal(p.bundle.routines.length, 1)                       // the all-invalid routine is dropped
  assert.equal(p.bundle.routines[0].ex.length, 1)                 // FAKE dropped
  assert.deepEqual(p.bundle.routines[0].ex[0], { id: '0025', sets: 4, reps: 8, rest: 120 })
  const id = p.bundle.routines[0].id
  // day 3 pointed at the dropped routine, so it falls away; days 1 and 5 keep the surviving one
  assert.deepEqual(p.bundle.week, { 1: id, 5: id })
})

test('the week survives a dropped middle routine by mapping on original index', () => {
  n = 0
  const input = {
    name: 'x', category: 'Strength Training',
    routines: [
      { name: 'A', exercises: [{ id: '0025', sets: 3, reps: 5 }] },
      { name: 'Gone', exercises: [{ id: 'NO', sets: 3, reps: 5 }] },
      { name: 'C', exercises: [{ id: '0043', sets: 3, reps: 5 }] }
    ],
    week: { 1: 0, 4: 2 }     // index 2 is "C", even though index 1 was dropped
  }
  const p = toPlan(input, { validIds: new Set(['0025', '0043']), rid })
  assert.equal(p.bundle.routines.length, 2)
  assert.equal(p.bundle.week['1'], p.bundle.routines[0].id)
  assert.equal(p.bundle.week['4'], p.bundle.routines[1].id)
})

test('an unknown category becomes Custom and sets/reps/rest are clamped', () => {
  n = 0
  const p = toPlan({ name: 'x', category: 'Nonsense', routines: [{ name: 'A', exercises: [{ id: '0025', sets: 99, reps: 0, rest: 9999 }] }], week: {} }, { validIds: new Set(['0025']), rid })
  assert.equal(p.category, 'Custom')
  assert.deepEqual(p.bundle.routines[0].ex[0], { id: '0025', sets: 12, reps: 1, rest: 600 })
})

test('a plan with no usable exercises is an error', () => {
  const p = toPlan({ routines: [{ name: 'A', exercises: [{ id: 'X', sets: 3, reps: 5 }] }], week: {} }, { validIds: new Set(['0025']), rid: () => 'r' })
  assert.ok(p.error)
  assert.ok(toPlan(null, { validIds: new Set(), rid: () => 'r' }).error)
})

test('an invented exercise is built into the bundle and referenced from the routine by its real id', () => {
  n = 0
  const input = {
    name: 'Legs', category: 'Muscle Building',
    customExercises: [
      { ref: 'x1', name: 'Nordic Curl', bodyPart: 'upper legs', target: 'Hamstrings' },
      { ref: 'x2', name: 'Unused Move', bodyPart: 'chest', target: 'pectorals' }   // never referenced
    ],
    routines: [{ name: 'Legs', exercises: [{ id: '0043', sets: 4, reps: 6 }, { id: 'x1', sets: 3, reps: 8 }] }],
    week: { 1: 0 }
  }
  const p = toPlan(input, { validIds: new Set(['0043']), rid })
  assert.equal(p.bundle.customEx.length, 1)                       // the unreferenced one is dropped
  const cx = p.bundle.customEx[0]
  assert.match(cx.id, /^c/)                                       // custom ids carry a distinct prefix
  assert.deepEqual({ n: cx.n, bp: cx.bp, tg: cx.tg }, { n: 'Nordic Curl', bp: 'upper legs', tg: 'hamstrings' })
  assert.deepEqual(p.bundle.routines[0].ex.map(e => e.id), ['0043', cx.id])   // ref rewritten to the real id
})

test('an invented exercise with an unknown body part is filed under a safe default', () => {
  n = 0
  const p = toPlan({ name: 'x', category: 'Custom', customExercises: [{ ref: 'x1', name: 'Mystery', bodyPart: 'elbow', target: 'biceps' }], routines: [{ name: 'A', exercises: [{ id: 'x1', sets: 3, reps: 10 }] }], week: {} }, { validIds: new Set(), rid })
  assert.equal(p.bundle.customEx[0].bp, 'waist')                  // 'elbow' isn't a body part -> default
})

test('the tool schema lets the model declare custom exercises against the real body parts', () => {
  const ce = PLAN_TOOL.input_schema.properties.customExercises
  assert.equal(ce.type, 'array')
  assert.deepEqual(ce.items.required, ['ref', 'name', 'bodyPart', 'target'])
  assert.ok(ce.items.properties.bodyPart.enum.includes('upper legs'))
})

test('the system prompt lets the model invent an exercise when the list lacks a fit', () => {
  const sys = systemPrompt({ perWeek: 3 }, C)
  assert.match(sys[0].text, /customExercises/)
})

test('candidateLines and userMessage are compact and complete', () => {
  assert.match(candidateLines(C), /0025\tbench press\tchest\tpectorals\tbarbell/)
  assert.match(userMessage({ goal: 'hypertrophy', perWeek: 4 }), /Goal: hypertrophy/)
  assert.match(userMessage({ perWeek: 3 }), /Days per week: 3/)
})

test('the tool schema restricts the category to the real plan list', () => {
  assert.ok(PLAN_TOOL.input_schema.properties.category.enum.includes('Muscle Building'))
  assert.equal(PLAN_TOOL.name, 'create_plan')
})

test('the system prompt asks for short routine names and caches the exercise list', () => {
  const sys = systemPrompt({ perWeek: 3 }, C)
  assert.match(sys[0].text, /name each routine briefly/i)       // keeps pill labels readable
  assert.match(sys[0].text, /3 training day/)                   // honours the requested day count
  assert.equal(sys[1].cache_control.type, 'ephemeral')          // the big list is cached
})
