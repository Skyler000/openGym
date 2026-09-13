import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY } from '../lib/time.js'
import { collectedAt, revenue, outstanding, coachBilling, monthlySeries, settle } from '../lib/billing.js'

const NOW = Date.UTC(2026, 8, 13, 6, 0, 0)   // 13 Sep 2026, 11:30 IST
const IST = 330

const annual = (coachId, amount, created) => ({ type: 'coach_annual', coachId, amount, created, settled: true, settledAt: created })
const charge = (coachId, clientId, amount, created, extra = {}) => ({ type: 'client_monthly', coachId, clientId, amount, created, settled: false, ...extra })

test('collectedAt: annual fees count when recorded, client charges only once settled', () => {
  assert.equal(collectedAt(annual('c', 6000, NOW)), NOW)
  assert.equal(collectedAt(charge('c', 'u', 500, NOW)), null)
  assert.equal(collectedAt(charge('c', 'u', 500, NOW, { settled: true, settledAt: NOW + DAY })), NOW + DAY)
})

test('revenue splits collected money into total, this month and this year', () => {
  const lastYear = Date.UTC(2025, 11, 20)
  const lastMonth = Date.UTC(2026, 7, 10)
  const ledger = [
    annual('c1', 6000, lastYear),
    annual('c2', 6000, lastMonth),
    annual('c3', 6000, NOW),
    charge('c1', 'u1', 500, NOW),                                          // owed, not collected
    charge('c1', 'u2', 500, lastMonth, { settled: true, settledAt: NOW })  // collected this month
  ]
  assert.deepEqual(revenue(ledger, NOW, IST), { total: 18500, month: 6500, year: 12500 })
})

test('month boundaries follow the business timezone, not the server’s UTC clock', () => {
  const edge = Date.UTC(2026, 7, 31, 20, 0, 0)   // 31 Aug 20:00 UTC = 1 Sep 01:30 IST
  const ledger = [annual('c1', 6000, edge)]
  const inSeptember = Date.UTC(2026, 8, 5)
  assert.equal(revenue(ledger, inSeptember, IST).month, 6000)
  assert.equal(revenue(ledger, inSeptember, 0).month, 0)
})

test('outstanding sums unsettled client charges, per coach or across the platform', () => {
  const ledger = [
    charge('c1', 'u1', 500, NOW),
    charge('c1', 'u2', 500, NOW),
    charge('c1', 'u3', 500, NOW, { settled: true, settledAt: NOW }),
    charge('c2', 'u4', 500, NOW),
    annual('c1', 6000, NOW)
  ]
  assert.equal(outstanding(ledger, 'c1'), 1000)
  assert.equal(outstanding(ledger, 'c2'), 500)
  assert.equal(outstanding(ledger), 1500)
})

test('coachBilling reports what a coach owes, paid and netted this month', () => {
  const lastMonth = Date.UTC(2026, 7, 10)
  const ledger = [
    annual('c1', 6000, lastMonth),
    charge('c1', 'u1', 500, NOW, { received: 2000 }),
    charge('c1', 'u2', 500, NOW, { received: 2500 }),
    charge('c1', 'u3', 500, lastMonth, { received: 2000, settled: true, settledAt: lastMonth }),
    charge('c2', 'u9', 500, NOW, { received: 9999 })                   // another coach
  ]
  assert.deepEqual(coachBilling(ledger, 'c1', NOW, IST), {
    owed: 1000, paidToPlatformYear: 6500, feesThisMonth: 1000,
    receivedThisMonth: 4500, netThisMonth: 3500, renewalsThisMonth: 2
  })
})

test('monthlySeries covers the last N months oldest first, empty months as zero', () => {
  const ledger = [annual('c1', 6000, Date.UTC(2026, 6, 15)), annual('c2', 6000, NOW)]
  assert.deepEqual(monthlySeries(ledger, NOW, 3, IST), [
    { month: '2026-07', revenue: 6000 },
    { month: '2026-08', revenue: 0 },
    { month: '2026-09', revenue: 6000 }
  ])
})

test('monthlySeries crosses a year boundary', () => {
  assert.deepEqual(monthlySeries([], Date.UTC(2026, 0, 10), 3, 0).map(r => r.month), ['2025-11', '2025-12', '2026-01'])
})

test('settle marks only that coach’s unpaid charges and reports what it settled', () => {
  const ledger = [
    charge('c1', 'u1', 500, NOW),
    charge('c1', 'u2', 500, NOW, { settled: true, settledAt: NOW - DAY }),
    charge('c2', 'u3', 500, NOW)
  ]
  assert.deepEqual(settle(ledger, 'c1', NOW, 'sa'), { count: 1, amount: 500 })
  assert.equal(ledger[0].settled, true)
  assert.equal(ledger[0].settledAt, NOW)
  assert.equal(ledger[0].settledBy, 'sa')
  assert.equal(ledger[1].settledAt, NOW - DAY)   // already settled: untouched
  assert.equal(ledger[2].settled, false)          // another coach: untouched
  assert.deepEqual(settle(ledger, 'c1', NOW, 'sa'), { count: 0, amount: 0 })
})
