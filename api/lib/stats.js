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

// The plan a client is on today: the most recently started assignment that has not ended.
export function assignmentOn(assignments, clientId, todayISO) {
  return assignments
    .filter(a => a.clientId === clientId && a.start <= todayISO && (!a.end || a.end >= todayISO))
    .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : b.created - a.created))[0] || null
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

// Workouts per Monday-start week across a whole roster, and how many clients trained in each.
export function rosterWeekly(states, todayISO, weeks = 12) {
  const rows = weeklyCounts([], todayISO, weeks).map(r => ({ week: r.week, workouts: 0, activeClients: 0 }))
  const at = Object.fromEntries(rows.map(r => [r.week, r]))
  for (const S of states) {
    const trained = new Set()
    for (const w of S?.workouts || []) {
      if (!w.d || w.d > todayISO) continue
      const row = at[mondayOf(w.d)]
      if (!row) continue
      row.workouts++
      trained.add(row.week)
    }
    for (const k of trained) at[k].activeClients++
  }
  return rows
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

// The latest day a client logged anything about their body: weight, composition, tape or a photo.
export function lastBodyLogDay(state) {
  let last = null
  for (const k of ['bodyweight', 'metrics', 'measure', 'photos']) {
    for (const x of state?.[k] || []) if (x?.d && (!last || x.d > last)) last = x.d
  }
  return last
}

const setsDoneIn = w => (w.entries || []).reduce((n, e) => n + (e.sets || []).filter(s => s.done).length, 0)

// What a coach's clients have been doing, newest first. `people` is [{ id, name, state }].
export function recentActivity(people, limit = 15) {
  const items = []
  for (const { id, name, state } of people) {
    const base = { clientId: id, name }
    const unit = state?.unit || 'kg'
    for (const w of state?.workouts || []) items.push({ ...base, kind: 'workout', d: w.d, at: w.end || w.start || 0, title: w.name || 'Workout', sets: setsDoneIn(w), prs: w.prs?.length || 0 })
    for (const b of state?.bodyweight || []) items.push({ ...base, kind: 'weight', d: b.d, at: b.t || 0, value: b.w, unit })
    for (const m of state?.metrics || []) items.push({ ...base, kind: 'metrics', d: m.d, at: 0, bodyFat: m.bf ?? null, muscleMass: m.mm ?? null, unit })
    for (const m of state?.measure || []) items.push({ ...base, kind: 'measure', d: m.d, at: 0 })
    for (const p of state?.photos || []) items.push({ ...base, kind: 'photo', d: p.d, at: 0 })
  }
  return items.filter(x => x.d)
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.at - a.at))
    .slice(0, limit)
}

// Roster-wide progress from per-client rows: [{ access, workouts30d, lastWorkout, onPlan, rate }].
// Being on a plan and having a compliance rate are not the same: a plan that starts today has no
// session due yet, so its client is on a plan with nothing to average. `rated` counts the second.
export function rosterProgress(rows, todayISO) {
  const active = rows.filter(r => r.access === 'active')
  const weekAgo = shiftISO(todayISO, -6)
  const rates = active.map(r => r.rate).filter(r => r != null)
  return {
    activeClients: active.length,
    workouts30d: rows.reduce((n, r) => n + (r.workouts30d || 0), 0),
    trainedLast7d: active.filter(r => r.lastWorkout && r.lastWorkout >= weekAgo && r.lastWorkout <= todayISO).length,
    onPlan: active.filter(r => r.onPlan || r.rate != null).length,
    rated: rates.length,
    avgCompliance: rates.length ? round2(rates.reduce((a, b) => a + b, 0) / rates.length) : null
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
