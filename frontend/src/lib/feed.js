// Pure helpers for the notification feed and the dashboards. No store and no network, so the
// wording, icons and routing rules are testable on their own.
import { t, dateLocale } from './i18n.js'

// '#/c/client/abc' → '/c/client/abc'. Anything that isn't an in-app route is never followed.
export const routeOf = url => (typeof url === 'string' && /^#\/[\w/-]*$/.test(url) ? url.slice(1) : null)

const ICON = { assigned: 'clipboard', renewed: 'check', payment_due: 'calendar', payment_expired: 'lock', account: 'shield', progress: 'ruler', message: 'chat' }
const TINT = { assigned: 'var(--blue)', renewed: 'var(--green)', payment_due: 'var(--yellow)', payment_expired: 'var(--orange)', account: 'var(--red)', progress: 'var(--teal)', message: 'var(--acc)' }
export const noteIcon = type => ICON[type] || 'bell'
export const noteTint = type => TINT[type] || 'var(--grey)'

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// 'just now' · '5 min ago' · '3 h ago' · 'Yesterday' · '12 Sept', with the year when it isn't this one.
export function relTime(ms, now = Date.now()) {
  const sec = Math.max(0, Math.round((now - ms) / 1000))
  const then = new Date(ms), today = new Date(now)
  if (sec < 60) return t('just now')
  if (sec < 3600) return t('{0} min ago', Math.floor(sec / 60))
  if (sameDay(then, today)) return t('{0} h ago', Math.floor(sec / 3600))
  const yesterday = new Date(now)
  yesterday.setDate(today.getDate() - 1)
  if (sameDay(then, yesterday)) return t('Yesterday')
  return then.toLocaleDateString(dateLocale(), {
    day: 'numeric', month: 'short', ...(then.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
  })
}

// 'YYYY-MM' → 'Sep'
export const monthLabel = key => new Date(key + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })

// Compact rupees for chart labels, in Indian units: ₹800 · ₹6k · ₹12.5k · ₹1.5L · ₹2Cr
export function shortINR(n) {
  const v = Math.round(n || 0)
  const one = x => String(Math.round(x * 10) / 10)
  if (v >= 1e7) return '₹' + one(v / 1e7) + 'Cr'
  if (v >= 1e5) return '₹' + one(v / 1e5) + 'L'
  if (v >= 1e3) return '₹' + one(v / 1e3) + 'k'
  return '₹' + v
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const num = n => String(Math.round(n * 10) / 10)

// One row of the coach dashboard's activity feed (api/lib/stats.js recentActivity). English only,
// like the rest of the coach screens.
export function activityText(a) {
  switch (a.kind) {
    case 'workout':
      return { icon: 'dumbbell', tint: 'var(--acc)', text: `${a.name} trained ${a.title}`,
        detail: [a.sets ? plural(a.sets, 'set') : null, a.prs ? plural(a.prs, 'PR') : null].filter(Boolean).join(' · ') }
    case 'weight':
      return { icon: 'scale', tint: 'var(--teal)', text: `${a.name} weighed in`, detail: `${num(a.value)} ${a.unit}` }
    case 'metrics':
      return { icon: 'target', tint: 'var(--purple)', text: `${a.name} logged body metrics`,
        detail: [a.bodyFat != null ? `${num(a.bodyFat)}% body fat` : null, a.muscleMass != null ? `${num(a.muscleMass)} ${a.unit} muscle` : null].filter(Boolean).join(' · ') }
    case 'measure':
      return { icon: 'ruler', tint: 'var(--blue)', text: `${a.name} logged measurements`, detail: '' }
    case 'photo':
      return { icon: 'camera', tint: 'var(--pink)', text: `${a.name} added a progress photo`, detail: '' }
    default:
      return { icon: 'bell', tint: 'var(--grey)', text: a.name, detail: '' }
  }
}
