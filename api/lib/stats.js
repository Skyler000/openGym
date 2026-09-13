// Progress and platform statistics, computed from a client's synced state and the user list.
// Pure: nothing here reads files or the clock, so every number a dashboard shows is testable.
import { monthKey, lastMonths, shiftISO, mondayOf, weekdayOf } from './time.js'

const round1 = n => Math.round(n * 10) / 10
const round2 = n => Math.round(n * 100) / 100
const byDay = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)
const LB = 0.45359237

// The app's units are labels — logged numbers are never converted — so a lb profile's weights
// really are pounds and have to be converted here, or BMI would be out by a factor of 2.2.
export function bmi(weight, heightCm, unit = 'kg') {
  const kg = unit === 'lb' ? weight * LB : weight
  if (!(kg > 0) || !(heightCm > 0)) return null
  const m = heightCm / 100
  return round1(kg / (m * m))
}

// Sessions a weekly plan schedules between two dates, inclusive. `week` maps weekday → routine.
export function plannedSessions(week, startISO, endISO) {
  if (!week || !startISO || !endISO || endISO < startISO) return 0
  const days = new Set(Object.keys(week).filter(k => week[k]).map(Number))
  if (!days.size) return 0
  let n = 0
  for (let d = startISO; d <= endISO; d = shiftISO(d, 1)) if (days.has(weekdayOf(d))) n++
  return n
}

// Done against planned, counting only days that have already happened — measured against the
// whole assignment, a four-week plan would read as failing on its first day.
//
// Every workout logged in the window counts, not only the plan's own routines: adding a plan to
// the weekly planner gives its routines fresh ids, so they cannot be matched back to the plan.
export function compliance(state, assignment, todayISO) {
  const start = assignment.start
  if (!start || start > todayISO) return { planned: 0, done: 0, rate: null }
  const end = assignment.end && assignment.end < todayISO ? assignment.end : todayISO
  const planned = plannedSessions(assignment.week, start, end)
  const done = (state?.workouts || []).filter(w => w.d >= start && w.d <= end).length
  return { planned, done, rate: planned ? Math.min(1, round2(done / planned)) : null }
}

// Workouts per Monday-start week for the last `weeks` weeks, oldest first.
export function weeklyCounts(workouts, todayISO, weeks = 8) {
  const thisMonday = mondayOf(todayISO)
  const keys = []
  for (let i = weeks - 1; i >= 0; i--) keys.push(shiftISO(thisMonday, -7 * i))
  const count = Object.fromEntries(keys.map(k => [k, 0]))
  for (const w of workouts || []) { const k = mondayOf(w.d); if (k in count) count[k]++ }
  return keys.map(k => ({ week: k, workouts: count[k] }))
}

export function clientSummary(state, todayISO) {
  const W = state?.workouts || []
  const from = shiftISO(todayISO, -29)
  const bw = [...(state?.bodyweight || [])].sort(byDay)
  const recent = bw.filter(b => b.d >= from)
  return {
    lastWorkout: W.reduce((last, w) => (!last || w.d > last ? w.d : last), null),
    workouts30d: W.filter(w => w.d >= from && w.d <= todayISO).length,
    weight: bw.length ? bw[bw.length - 1].w : null,
    weightChange30d: recent.length > 1 ? round1(recent[recent.length - 1].w - recent[0].w) : null,
    unit: state?.unit || 'kg'
  }
}

export function bodyMetrics(state) {
  const bw = [...(state?.bodyweight || [])].sort(byDay)
  const metrics = [...(state?.metrics || [])].sort(byDay)
  const weight = bw.length ? bw[bw.length - 1].w : null
  const last = metrics.length ? metrics[metrics.length - 1] : null
  const unit = state?.unit || 'kg'
  const height = state?.height || null
  return {
    weight, unit, height,
    bmi: weight != null ? bmi(weight, height, unit) : null,
    bodyFat: last?.bf ?? null,
    muscleMass: last?.mm ?? null
  }
}

// One calendar month ('YYYY-MM') of a client's training, for the coach's monthly report.
export function monthlyReport(state, month) {
  const W = (state?.workouts || []).filter(w => w.d.slice(0, 7) === month)
  const bw = (state?.bodyweight || []).filter(b => b.d.slice(0, 7) === month).sort(byDay)
  return {
    month,
    workouts: W.length,
    activeDays: new Set(W.map(w => w.d)).size,
    volume: Math.round(W.reduce((n, w) => n + (w.vol || 0), 0)),
    prs: W.reduce((n, w) => n + (w.prs?.length || 0), 0),
    weightStart: bw.length ? bw[0].w : null,
    weightEnd: bw.length ? bw[bw.length - 1].w : null
  }
}

// New coaches and clients per month. Expects users whose `role` is already resolved.
export function growthSeries(users, now, months = 12, offsetMin = 0) {
  const keys = lastMonths(now, months, offsetMin)
  const rows = keys.map(month => ({ month, coaches: 0, clients: 0 }))
  const at = Object.fromEntries(keys.map((k, i) => [k, rows[i]]))
  for (const u of users) {
    if (!u.created) continue
    const row = at[monthKey(Date.parse(u.created), offsetMin)]
    if (!row) continue
    if (u.role === 'coach') row.coaches++
    else if (u.role === 'client') row.clients++
  }
  return rows
}

// Lapsed as a share of accounts that were paid up. Locked and suspended accounts are left out:
// those are decisions somebody made, not customers who stopped paying.
export function churn(accessStates) {
  const active = accessStates.filter(a => a === 'active').length
  const lapsed = accessStates.filter(a => a === 'expired').length
  const base = active + lapsed
  return { active, lapsed, rate: base ? round2(lapsed / base) : null }
}

// Share of clients renewed at least once. Registration records the first month, so a client
// with two or more monthly entries is one whose coach chose to keep them.
export function retention(clientIds, ledger) {
  if (!clientIds.length) return null
  const months = {}
  for (const e of ledger) if (e.type === 'client_monthly' && e.clientId) months[e.clientId] = (months[e.clientId] || 0) + 1
  return round2(clientIds.filter(id => (months[id] || 0) >= 2).length / clientIds.length)
}
