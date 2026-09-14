// Pure helpers for the chat screens: grouping by day, sizes and durations, presence wording, and
// folding live events into a loaded conversation. No store and no network.
import { t, dateLocale } from './i18n.js'
import { relTime } from './feed.js'

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// 'Today' · 'Yesterday' · 'Thu 10 Sept'
export function dayLabel(ms, now = Date.now()) {
  const d = new Date(ms), today = new Date(now)
  if (sameDay(d, today)) return t('Today')
  const yesterday = new Date(now)
  yesterday.setDate(today.getDate() - 1)
  if (sameDay(d, yesterday)) return t('Yesterday')
  return d.toLocaleDateString(dateLocale(), {
    weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
  })
}

// Consecutive messages grouped under their local calendar day, in the order given.
export function groupByDay(messages, now = Date.now()) {
  const groups = []
  for (const m of messages) {
    const d = new Date(m.created)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) groups.push(g = { key, label: dayLabel(m.created, now), items: [] })
    g.items.push(m)
  }
  return groups
}

export const timeOf = ms => new Date(ms).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

export function fmtBytes(n) {
  if (!(n > 0)) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB'
  return Math.round(n / 1024 / 1024 * 10) / 10 + ' MB'
}

export const fmtClock = secs => {
  const s = Math.max(0, Math.round(secs || 0))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

// 'online' · 'last seen 5 min ago' · 'offline'
export function presenceText(p, now = Date.now()) {
  if (p?.online) return t('online')
  if (p?.lastSeen) return t('last seen {0}', relTime(p.lastSeen, now))
  return t('offline')
}

// Adds a message once, in time order. A sender gets their own message twice — once from the request
// that sent it and once from the live stream — and must see it once.
export function mergeMessage(list, m) {
  if (list.some(x => x.id === m.id)) return list
  return [...list, m].sort((a, b) => a.created - b.created)
}

// Folds a freshly fetched page into a loaded conversation: fresher copies replace what is there (a
// receipt may have been missed while the stream was down), new messages are added, order stays by time.
export function mergeMessages(list, incoming) {
  const fresh = new Map(incoming.map(m => [m.id, m]))
  const kept = list.map(m => fresh.get(m.id) || m)
  const have = new Set(kept.map(m => m.id))
  return [...kept, ...incoming.filter(m => !have.has(m.id))].sort((a, b) => a.created - b.created)
}

// A read receipt: the listed messages were read at `at`. Earlier receipts keep their time.
export function applyReceipt(list, { ids, at }) {
  const read = new Set(ids)
  return list.map(m => (read.has(m.id) && !m.readAt ? { ...m, readAt: at } : m))
}

// 'Arjun Client' → 'AC', for an avatar. Counts code points, so a name starting with an emoji keeps it whole.
export const initials = name =>
  String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0].toUpperCase()).join('') || '?'

export const EMOJI = ['👍', '💪', '🔥', '👏', '🙌', '😊', '😂', '😅', '🤔', '😴', '🥵', '🥗', '🍗', '🥤', '💧',
  '🏋️', '🏃', '🚴', '🧘', '⏱️', '✅', '❌', '⭐', '🎯', '📈', '📉', '❤️', '🙏', '👀', '🎉']
