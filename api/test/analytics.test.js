import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignmentOn } from '../lib/stats.js'

test('assignmentOn picks the latest-starting plan that is running today', () => {
  const list = [
    { id: 'old', clientId: 'u1', start: '2026-08-01', end: null, created: 1 },
    { id: 'new', clientId: 'u1', start: '2026-09-01', end: '2026-09-30', created: 2 },
    { id: 'future', clientId: 'u1', start: '2026-10-01', end: null, created: 3 },
    { id: 'ended', clientId: 'u1', start: '2026-09-05', end: '2026-09-10', created: 4 },
    { id: 'other', clientId: 'u2', start: '2026-09-12', end: null, created: 5 }
  ]
  assert.equal(assignmentOn(list, 'u1', '2026-09-13').id, 'new')
  assert.equal(assignmentOn(list, 'u1', '2026-10-02').id, 'future')
  assert.equal(assignmentOn(list, 'u1', '2026-07-01'), null)
  assert.equal(assignmentOn(list, 'u3', '2026-09-13'), null)
})

test('assignmentOn: two plans starting the same day — the one assigned last wins', () => {
  const list = [
    { id: 'first', clientId: 'u1', start: '2026-09-13', created: 10 },
    { id: 'second', clientId: 'u1', start: '2026-09-13', created: 20 }
  ]
  assert.equal(assignmentOn(list, 'u1', '2026-09-13').id, 'second')
})
