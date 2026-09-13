import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY, fmtDay } from '../lib/time.js'
import { lastBodyLogDay, recentActivity, rosterProgress } from '../lib/stats.js'
import { coachEarningsSeries, recentCollections } from '../lib/billing.js'

const NOW = Date.UTC(2026, 8, 13, 6, 0, 0)

test('lastBodyLogDay takes the latest day across weight, metrics, measurements and photos', () => {
  assert.equal(lastBodyLogDay(null), null)
  assert.equal(lastBodyLogDay({
    bodyweight: [{ d: '2026-09-01', w: 70 }], metrics: [{ d: '2026-09-05', bf: 18 }], photos: [{ d: '2026-09-03', id: 'x' }]
  }), '2026-09-05')
  assert.equal(lastBodyLogDay({ measure: [{ d: '2026-08-30', waist: 80 }] }), '2026-08-30')
})

test('recentActivity merges every client, newest first, and counts only completed sets', () => {
  const people = [
    { id: 'a', name: 'Arjun', state: {
      unit: 'kg', bodyweight: [{ d: '2026-09-13', w: 72.4 }],
      workouts: [{ d: '2026-09-12', end: 2, name: 'Workout A', prs: ['x'], entries: [{ sets: [{ done: true }, { done: false }, { done: true }] }] }]
    } },
    { id: 'b', name: 'Bea', state: { workouts: [{ d: '2026-09-12', end: 5, name: 'Legs', entries: [] }], photos: [{ d: '2026-09-10', id: 'p' }] } },
    { id: 'c', name: 'Cy', state: null }
  ]
  const items = recentActivity(people)
  assert.deepEqual(items.map(i => [i.name, i.kind, i.d]), [
    ['Arjun', 'weight', '2026-09-13'], ['Bea', 'workout', '2026-09-12'], ['Arjun', 'workout', '2026-09-12'], ['Bea', 'photo', '2026-09-10']
  ])
  assert.equal(items[2].sets, 2)
  assert.equal(items[2].prs, 1)
  assert.equal(items[0].value, 72.4)
  assert.equal(recentActivity(people, 2).length, 2)
})

test('rosterProgress averages compliance over active clients with sessions due', () => {
  const rows = [
    { access: 'active', workouts30d: 10, lastWorkout: '2026-09-12', onPlan: true, rate: 0.8 },
    { access: 'active', workouts30d: 4, lastWorkout: '2026-09-01', onPlan: true, rate: 0.5 },
    { access: 'active', workouts30d: 0, lastWorkout: null, onPlan: false, rate: null },
    { access: 'expired', workouts30d: 3, lastWorkout: '2026-09-13', onPlan: true, rate: 1 }
  ]
  assert.deepEqual(rosterProgress(rows, '2026-09-13'), { activeClients: 3, workouts30d: 17, trainedLast7d: 1, onPlan: 2, rated: 2, avgCompliance: 0.65 })
  assert.deepEqual(rosterProgress([], '2026-09-13'), { activeClients: 0, workouts30d: 0, trainedLast7d: 0, onPlan: 0, rated: 0, avgCompliance: null })
})

test('rosterProgress counts a plan that starts today as on a plan, with nothing yet to average', () => {
  const rows = [{ access: 'active', workouts30d: 1, lastWorkout: '2026-09-13', onPlan: true, rate: null }]
  assert.deepEqual(rosterProgress(rows, '2026-09-13'), { activeClients: 1, workouts30d: 1, trainedLast7d: 1, onPlan: 1, rated: 0, avgCompliance: null })
})

test('coachEarningsSeries: one coach’s received money and fees per month, empty months as zero', () => {
  const ledger = [
    { type: 'client_monthly', coachId: 'c1', amount: 500, received: 2000, created: NOW },
    { type: 'client_monthly', coachId: 'c1', amount: 500, created: NOW - 40 * DAY },
    { type: 'client_monthly', coachId: 'c2', amount: 500, received: 900, created: NOW },
    { type: 'coach_annual', coachId: 'c1', amount: 6000, created: NOW }
  ]
  assert.deepEqual(coachEarningsSeries(ledger, 'c1', NOW, 3, 330), [
    { month: '2026-07', received: 0, fees: 0 },
    { month: '2026-08', received: 0, fees: 500 },
    { month: '2026-09', received: 2000, fees: 500 }
  ])
})

test('recentCollections lists annual fees one by one and each settlement as one row', () => {
  const ledger = [
    { type: 'coach_annual', coachId: 'c1', amount: 6000, created: 100 },
    { type: 'client_monthly', coachId: 'c1', amount: 500, created: 150, settled: true, settledAt: 300 },
    { type: 'client_monthly', coachId: 'c1', amount: 500, created: 160, settled: true, settledAt: 300 },
    { type: 'client_monthly', coachId: 'c1', amount: 500, created: 170, settled: false },
    { type: 'coach_annual', coachId: 'c2', amount: 6000, created: 200 }
  ]
  assert.deepEqual(recentCollections(ledger).map(r => [r.kind, r.coachId, r.amount, r.count ?? null]), [
    ['settlement', 'c1', 1000, 2], ['annual', 'c2', 6000, null], ['annual', 'c1', 6000, null]
  ])
  assert.equal(recentCollections(ledger, 1).length, 1)
})

test('fmtDay reads the calendar date at the given offset', () => {
  // 20:00 UTC on 13 September is already the 14th in India.
  assert.match(fmtDay(Date.UTC(2026, 8, 13, 20, 0), 330), /^14 Sep/)
  assert.match(fmtDay(Date.UTC(2026, 8, 13, 20, 0), 0), /^13 Sep/)
})
