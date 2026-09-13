// Time helpers shared by the access, billing and stats rules. Every function takes explicit
// milliseconds and an explicit UTC offset, so day and month boundaries are decided by the
// caller rather than by whatever timezone the server process happens to run in.

export const DAY = 86400000

const shifted = (ms, offsetMin) => new Date(ms + (offsetMin || 0) * 60000)

// 'YYYY-MM-DD' / 'YYYY-MM' / 'YYYY' for an instant, as seen at the given offset.
export const isoDay = (ms, offsetMin = 0) => shifted(ms, offsetMin).toISOString().slice(0, 10)
export const monthKey = (ms, offsetMin = 0) => isoDay(ms, offsetMin).slice(0, 7)
export const yearKey = (ms, offsetMin = 0) => isoDay(ms, offsetMin).slice(0, 4)

// Calendar arithmetic on 'YYYY-MM-DD' strings. Anchoring at noon UTC keeps DST and the
// offset out of it — a day step is always exactly one calendar day.
export function shiftISO(iso, days) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay()

// Monday of the week containing `iso`.
export const mondayOf = iso => shiftISO(iso, -((weekdayOf(iso) + 6) % 7))

// The last `n` month keys ending with the month containing `ms`, oldest first.
export function lastMonths(ms, n, offsetMin = 0) {
  const [y, m] = monthKey(ms, offsetMin).split('-').map(Number)
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    let mm = m - 1 - i, yy = y
    while (mm < 0) { mm += 12; yy-- }
    out.push(yy + '-' + String(mm + 1).padStart(2, '0'))
  }
  return out
}
