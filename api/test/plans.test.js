import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanBundle } from '../routes/coach.js'

let n = 0
const rid = () => 'gen' + (++n)

test('cleanBundle keeps known exercise fields, including a coach note and rest time', () => {
  const b = cleanBundle({
    routines: [{
      id: 'r1', name: 'Push', emoji: 'barbell', prog: 'linear',
      ex: [{ id: '0025', sets: 4, reps: 8, rest: 120, note: '  pause at the bottom  ', evil: '<script>', weight: '60' }]
    }],
    week: { 1: 'r1', 9: 'r1', 3: 'nope' },
    customEx: [{ id: 'c1', n: 'Band pull-apart', bp: 'shoulders', extra: 1 }]
  }, rid)
  // A string weight is dropped rather than coerced: a plan field that arrives as the wrong type
  // is not trusted into someone else's state.
  assert.deepEqual(b.routines[0].ex[0], { id: '0025', sets: 4, reps: 8, rest: 120, note: 'pause at the bottom' })
  assert.deepEqual(b.routines[0], { id: 'r1', name: 'Push', emoji: 'barbell', prog: 'linear', ex: b.routines[0].ex })
  assert.deepEqual(b.week, { 1: 'r1' })   // day 9 doesn't exist; day 3 names no routine in the plan
  assert.deepEqual(b.customEx, [{ id: 'c1', n: 'Band pull-apart', bp: 'shoulders' }])
  assert.equal(b.opengym_plan, 1)
})

test('cleanBundle rejects a bundle with no routine list and caps how much it keeps', () => {
  assert.equal(cleanBundle(null, rid), null)
  assert.equal(cleanBundle({ routines: 'x' }, rid), null)
  const many = cleanBundle({ routines: Array.from({ length: 20 }, (_, i) => ({ id: 'r' + i, name: 'R', ex: [] })) }, rid)
  assert.equal(many.routines.length, 14)
})

test('cleanBundle gives duplicate or missing routine ids fresh ones', () => {
  const b = cleanBundle({ routines: [{ id: 'dup', ex: [] }, { id: 'dup', ex: [] }, { ex: [] }] }, rid)
  const ids = b.routines.map(r => r.id)
  assert.equal(new Set(ids).size, 3)
  assert.equal(ids[0], 'dup')
  assert.equal(b.routines[2].name, 'Routine')
})
