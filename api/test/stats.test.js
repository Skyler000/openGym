import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bmi, plannedSessions, compliance, weeklyCounts, clientSummary, bodyMetrics,
  monthlyReport, growthSeries, churn, retention
} from '../lib/stats.js'

const NOW = Date.UTC(2026, 8, 13, 6, 0, 0)
const MWF = { 1: 'a', 3: 'b', 5: 'a' }   // 2026-09-14 is a Monday

test('bmi works from kg or lb and needs a height', () => {
  assert.equal(bmi(70, 175), 22.9)
  assert.equal(bmi(154.3, 175, 'lb'), 22.9)
  assert.equal(bmi(70, null), null)
  assert.equal(bmi(0, 175), null)
})

test('plannedSessions counts scheduled weekdays in an inclusive range', () => {
  assert.equal(plannedSessions(MWF, '2026-09-14', '2026-09-20'), 3)
  assert.equal(plannedSessions(MWF, '2026-09-14', '2026-09-27'), 6)
  assert.equal(plannedSessions(MWF, '2026-09-15', '2026-09-15'), 0)   // a Tuesday
  assert.equal(plannedSessions({}, '2026-09-14', '2026-09-20'), 0)
  assert.equal(plannedSessions(MWF, '2026-09-20', '2026-09-14'), 0)   // reversed range
})

test('compliance counts only days that have already happened', () => {
  const a = { start: '2026-09-14', end: '2026-10-11', week: MWF }
  const state = { workouts: [{ d: '2026-09-14' }, { d: '2026-09-16' }, { d: '2026-09-10' }] }
  assert.deepEqual(compliance(state, a, '2026-09-16'), { planned: 2, done: 2, rate: 1 })     // Mon+Wed, both done
  assert.deepEqual(compliance(state, a, '2026-09-18'), { planned: 3, done: 2, rate: 0.67 })  // Friday missed
  assert.deepEqual(compliance(state, a, '2026-09-13'), { planned: 0, done: 0, rate: null })  // not started
})

test('compliance stops counting at the assignment end date', () => {
  const a = { start: '2026-09-14', end: '2026-09-16', week: MWF }
  const state = { workouts: [{ d: '2026-09-14' }, { d: '2026-09-18' }] }
  assert.deepEqual(compliance(state, a, '2026-09-30'), { planned: 2, done: 1, rate: 0.5 })
})

test('weeklyCounts buckets by Monday-start week, oldest first', () => {
  const w = [{ d: '2026-09-14' }, { d: '2026-09-16' }, { d: '2026-09-08' }, { d: '2026-08-01' }]
  assert.deepEqual(weeklyCounts(w, '2026-09-17', 3), [
    { week: '2026-08-31', workouts: 0 },
    { week: '2026-09-07', workouts: 1 },
    { week: '2026-09-14', workouts: 2 }
  ])
})

test('clientSummary gives a coach the at-a-glance numbers', () => {
  const state = {
    unit: 'kg',
    workouts: [{ d: '2026-09-10' }, { d: '2026-08-01' }, { d: '2026-09-12' }],
    bodyweight: [{ d: '2026-08-20', w: 80 }, { d: '2026-09-12', w: 78.5 }, { d: '2026-07-01', w: 82 }]
  }
  assert.deepEqual(clientSummary(state, '2026-09-13'),
    { lastWorkout: '2026-09-12', workouts30d: 2, weight: 78.5, weightChange30d: -1.5, unit: 'kg' })
  assert.deepEqual(clientSummary(null, '2026-09-13'),
    { lastWorkout: null, workouts30d: 0, weight: null, weightChange30d: null, unit: 'kg' })
})

test('bodyMetrics takes the latest of each measure', () => {
  const state = {
    unit: 'kg', height: 175,
    bodyweight: [{ d: '2026-09-01', w: 72 }, { d: '2026-09-10', w: 70 }],
    metrics: [{ d: '2026-09-02', bf: 20, mm: 33 }, { d: '2026-09-09', bf: 18.5, mm: 34 }]
  }
  assert.deepEqual(bodyMetrics(state), { weight: 70, unit: 'kg', height: 175, bmi: 22.9, bodyFat: 18.5, muscleMass: 34 })
  assert.deepEqual(bodyMetrics({}), { weight: null, unit: 'kg', height: null, bmi: null, bodyFat: null, muscleMass: null })
})

test('monthlyReport summarises one calendar month', () => {
  const state = {
    workouts: [
      { d: '2026-09-01', vol: 1000.4, prs: ['x'] },
      { d: '2026-09-01', vol: 500 },
      { d: '2026-09-20', vol: 2000, prs: ['y', 'z'] },
      { d: '2026-08-31', vol: 9999 }
    ],
    bodyweight: [{ d: '2026-09-02', w: 80 }, { d: '2026-09-25', w: 79 }, { d: '2026-10-01', w: 70 }]
  }
  assert.deepEqual(monthlyReport(state, '2026-09'),
    { month: '2026-09', workouts: 3, activeDays: 2, volume: 3500, prs: 3, weightStart: 80, weightEnd: 79 })
})

test('growthSeries counts new coaches and clients per month', () => {
  const users = [
    { role: 'coach', created: '2026-08-05T10:00:00.000Z' },
    { role: 'client', created: '2026-09-01T10:00:00.000Z' },
    { role: 'client', created: '2026-09-03T10:00:00.000Z' },
    { role: 'client', created: '2025-01-01T10:00:00.000Z' },     // outside the window
    { role: 'superadmin', created: '2026-09-01T10:00:00.000Z' },  // neither coach nor client
    { role: 'coach' }                                             // no signup date
  ]
  assert.deepEqual(growthSeries(users, NOW, 2, 0), [
    { month: '2026-08', coaches: 1, clients: 0 },
    { month: '2026-09', coaches: 0, clients: 2 }
  ])
})

test('churn is lapsed over ever-paid, ignoring deliberate locks and suspensions', () => {
  assert.deepEqual(churn(['active', 'active', 'expired', 'locked', 'suspended']), { active: 2, lapsed: 1, rate: 0.33 })
  assert.deepEqual(churn([]), { active: 0, lapsed: 0, rate: null })
})

test('retention is the share of clients renewed at least once', () => {
  const ledger = [
    { type: 'client_monthly', clientId: 'u1' }, { type: 'client_monthly', clientId: 'u1' },
    { type: 'client_monthly', clientId: 'u2' },
    { type: 'coach_annual', coachId: 'c1' }
  ]
  assert.equal(retention(['u1', 'u2', 'u3'], ledger), 0.33)
  assert.equal(retention([], ledger), null)
})
