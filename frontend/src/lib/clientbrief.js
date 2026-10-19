// Turns a client's training history into a compact brief the AI reads before drafting next week's
// plan — so the plan adapts to what they've actually been doing instead of being generic. Pure over
// the state object S; unit-tested in clientbrief.test.js. The weights are in the client's own unit.
import { exOr } from './exercises.js'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from './muscles.js'
import { isoOf, weekKey } from './format.js'

const DAY = 86400000
const round1 = n => Math.round(n * 10) / 10
const topW = sets => Math.max(0, ...sets.map(s => s.w || 0))

/**
 * Analyse the last `weeks` of training. Returns a structured brief:
 *   consistency  — sessions, sessions/week, weeks trained, days since last
 *   bodyweight   — latest and the change across the window
 *   lifts        — the most-trained exercises with best, latest top set, and trend
 *   volumeByWeek — tonnage (Σ weight×reps of done sets) per week, oldest first
 *   muscles      — worked (hardest first) and missed (untrained) in the window
 *   plan         — the routines they have and the weekday schedule
 */
export function buildClientBrief(S, { weeks = 6, now = Date.now() } = {}) {
  const unit = S.unit || 'kg'
  const fromIso = isoOf(new Date(now - weeks * 7 * DAY))
  const all = (S.workouts || [])
  const workouts = all.filter(w => w && w.d >= fromIso)   // ISO dates sort chronologically

  // consistency
  const sessions = workouts.length
  const weeksTrained = new Set(workouts.map(w => weekKey(w.d))).size
  const last = all.length ? all[all.length - 1].d : null
  const daysSinceLast = last ? Math.round((now - Date.parse(last + 'T00:00:00')) / DAY) : null

  // bodyweight across the window
  const bws = (S.bodyweight || []).filter(b => b && b.d >= fromIso)
  const bodyweight = bws.length ? { now: bws[bws.length - 1].w, change: round1(bws[bws.length - 1].w - bws[0].w) } : null

  // per-exercise sessions → best, latest top set, and trend
  const byEx = {}
  for (const w of workouts) for (const e of (w.entries || [])) {
    const done = (e.sets || []).filter(s => s.done)
    if (!done.length) continue
    const arr = byEx[e.id] || (byEx[e.id] = [])
    arr.push({ d: w.d, top: topW(done), sets: done.length })
  }
  const lifts = Object.entries(byEx).map(([id, s]) => {
    s.sort((a, b) => (a.d < b.d ? -1 : 1))
    const setCount = s.reduce((n, x) => n + x.sets, 0)
    const first = s[0].top, latest = s[s.length - 1].top
    const trend = s.length < 2 ? 'new' : latest > first ? 'up' : latest < first ? 'down' : 'flat'
    return { id, name: exOr(id).n, sets: setCount, best: Math.max(...s.map(x => x.top)), last: latest, trend }
  }).sort((a, b) => b.sets - a.sets).slice(0, 10)

  // tonnage per week, oldest first
  const wk = {}
  for (const w of workouts) {
    const k = weekKey(w.d)
    let vol = 0
    for (const e of (w.entries || [])) for (const s of (e.sets || [])) if (s.done) vol += (s.w || 0) * (s.r || 0)
    const b = wk[k] || (wk[k] = { week: k, volume: 0, d: w.d })
    b.volume += vol
    if (w.d < b.d) b.d = w.d
  }
  const volumeByWeek = Object.values(wk).sort((a, b) => (a.d < b.d ? -1 : 1)).map(x => ({ week: x.week, volume: Math.round(x.volume) }))

  // muscle balance over the window
  const { worked, missed } = rankOf(loadOfWorkouts(workouts))

  const plan = {
    routines: (S.routines || []).map(r => r.name).filter(Boolean),
    week: Object.fromEntries(Object.entries(S.week || {}).map(([d, rid]) => [d, (S.routines || []).find(r => r.id === rid)?.name]).filter(([, n]) => n))
  }

  return { unit, window: { weeks, from: fromIso }, consistency: { sessions, perWeek: round1(sessions / weeks), weeksTrained, daysSinceLast }, bodyweight, lifts, volumeByWeek, muscles: { worked, missed }, plan }
}

const mName = slug => MUSCLE_NAME[slug] || slug

// A compact text rendering of the brief for the AI prompt — a few short, labelled lines.
export function briefText(b) {
  const u = b.unit
  const L = []
  const c = b.consistency
  L.push(`Training (last ${b.window.weeks} wks): ${c.sessions} sessions, ~${c.perWeek}/wk over ${c.weeksTrained} active wk(s)` + (c.daysSinceLast != null ? `, last ${c.daysSinceLast}d ago` : ', none logged'))
  if (b.bodyweight) L.push(`Bodyweight: ${b.bodyweight.now} ${u} (${b.bodyweight.change >= 0 ? '+' : ''}${b.bodyweight.change} over window)`)
  if (b.lifts.length) {
    L.push('Lifts (sets · best · last · trend):')
    for (const x of b.lifts) L.push(`  ${x.name}: ${x.sets} sets · best ${x.best}${u} · last ${x.last}${u} · ${x.trend}`)
  }
  if (b.volumeByWeek.length) L.push(`Weekly volume (${u}·reps): ${b.volumeByWeek.map(v => v.volume).join(' → ')}`)
  if (b.muscles.worked.length) L.push(`Most worked: ${b.muscles.worked.slice(0, 5).map(mName).join(', ')}`)
  if (b.muscles.missed.length) L.push(`Neglected: ${b.muscles.missed.map(mName).join(', ')}`)
  if (b.plan.routines.length) L.push(`Current plan: ${b.plan.routines.join(', ')}`)
  return L.join('\n')
}
