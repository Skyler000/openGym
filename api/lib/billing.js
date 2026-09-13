// The ledger: what coaches have paid the platform and what they still owe it. Pure.
//
// Two kinds of entry, and they become revenue at different moments:
//   coach_annual   — a coach's yearly fee. Collected the moment the super admin records it.
//   client_monthly — a coach renewing one client. This is a CHARGE against the coach, not money
//                    in: it only becomes revenue when the super admin settles that coach's dues.
// Counting a recorded client renewal as revenue would report money the platform has not got.
import { monthKey, yearKey, lastMonths } from './time.js'

export const DEFAULT_FEES = { coachAnnualFee: 6000, clientMonthlyFee: 500 }

export function collectedAt(e) {
  if (e.type === 'coach_annual') return e.created
  return e.settled ? e.settledAt : null
}

const sum = (list, f = e => e.amount) => list.reduce((n, e) => n + (f(e) || 0), 0)

export function revenue(ledger, now, offsetMin = 0) {
  const m = monthKey(now, offsetMin), y = yearKey(now, offsetMin)
  let total = 0, month = 0, year = 0
  for (const e of ledger) {
    const at = collectedAt(e)
    if (!at) continue
    total += e.amount
    if (monthKey(at, offsetMin) === m) month += e.amount
    if (yearKey(at, offsetMin) === y) year += e.amount
  }
  return { total, month, year }
}

// Client renewals a coach has recorded but not yet paid over. Omit coachId for the platform total.
export const outstanding = (ledger, coachId) =>
  sum(ledger.filter(e => e.type === 'client_monthly' && !e.settled && (!coachId || e.coachId === coachId)))

// A coach's own view. `received` is what the CLIENT paid the coach, entered optionally at renewal.
// The platform never sees that money, so this is the only way a coach's earnings can be shown.
export function coachBilling(ledger, coachId, now, offsetMin = 0) {
  const m = monthKey(now, offsetMin), y = yearKey(now, offsetMin)
  const mine = ledger.filter(e => e.coachId === coachId)
  const thisMonth = mine.filter(e => e.type === 'client_monthly' && monthKey(e.created, offsetMin) === m)
  const feesThisMonth = sum(thisMonth)
  const receivedThisMonth = sum(thisMonth, e => e.received)
  return {
    owed: outstanding(ledger, coachId),
    paidToPlatformYear: sum(mine.filter(e => { const at = collectedAt(e); return at && yearKey(at, offsetMin) === y })),
    feesThisMonth,
    receivedThisMonth,
    netThisMonth: receivedThisMonth - feesThisMonth,
    renewalsThisMonth: thisMonth.length
  }
}

// Collected revenue per month for the last `months` months, oldest first, empty months as zero.
export function monthlySeries(ledger, now, months = 12, offsetMin = 0) {
  const keys = lastMonths(now, months, offsetMin)
  const byMonth = Object.fromEntries(keys.map(k => [k, 0]))
  for (const e of ledger) {
    const at = collectedAt(e)
    if (!at) continue
    const k = monthKey(at, offsetMin)
    if (k in byMonth) byMonth[k] += e.amount
  }
  return keys.map(k => ({ month: k, revenue: byMonth[k] }))
}

// A coach's money per month for the last `months` months, oldest first: what their clients paid
// them (as the coach recorded it at renewal) and what those renewals cost in platform fees.
export function coachEarningsSeries(ledger, coachId, now, months = 6, offsetMin = 0) {
  const keys = lastMonths(now, months, offsetMin)
  const rows = Object.fromEntries(keys.map(k => [k, { month: k, received: 0, fees: 0 }]))
  for (const e of ledger) {
    if (e.coachId !== coachId || e.type !== 'client_monthly') continue
    const row = rows[monthKey(e.created, offsetMin)]
    if (!row) continue
    row.fees += e.amount || 0
    row.received += e.received || 0
  }
  return keys.map(k => rows[k])
}

// Money in, newest first. One settlement pays many client renewals at once, so it is one row.
export function recentCollections(ledger, limit = 10) {
  const rows = []
  const settlements = new Map()
  for (const e of ledger) {
    if (e.type === 'coach_annual') {
      rows.push({ kind: 'annual', coachId: e.coachId, amount: e.amount, at: e.created, note: e.note || '' })
    } else if (e.settled && e.settledAt) {
      const key = e.coachId + ':' + e.settledAt
      const s = settlements.get(key) || { kind: 'settlement', coachId: e.coachId, amount: 0, count: 0, at: e.settledAt }
      s.amount += e.amount
      s.count++
      settlements.set(key, s)
    }
  }
  return rows.concat([...settlements.values()]).sort((a, b) => b.at - a.at).slice(0, limit)
}

// Marks every unpaid client charge of one coach as settled. Mutates the ledger in place.
export function settle(ledger, coachId, now, by) {
  let count = 0, amount = 0
  for (const e of ledger) {
    if (e.type !== 'client_monthly' || e.settled || e.coachId !== coachId) continue
    e.settled = true; e.settledAt = now; e.settledBy = by
    count++; amount += e.amount
  }
  return { count, amount }
}
