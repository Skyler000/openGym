// The notification feed's unread count, polled while the app is open. Push (sw.js) is the extra that
// reaches a closed app; the feed is the part that always arrives, over plain HTTP and on browsers
// without push support.
import { create } from 'zustand'
import { api } from './api.js'
import { routeOf } from './feed.js'

const POLL_MS = 60000

export const useNotes = create((set, get) => ({
  unread: 0,
  primed: false,
  // Resolves true when the count went up since the last check — never on the first one, which
  // only learns the starting count.
  async refresh() {
    try {
      const { unread } = await api('/api/notifications/unread')
      const grew = get().primed && unread > get().unread
      set({ unread, primed: true })
      return grew
    } catch { return false }
  },
  markAllRead: () => set({ unread: 0 }),
  reset: () => set({ unread: 0, primed: false })
}))

// Polls for a signed-in account and returns the function that stops it. A new notification can
// mean this account's access changed — a coach renewed or paused it — so `onNew` re-reads who we
// are. That is what lifts a lock screen by itself once access is restored.
export function startNotificationPolling(onNew) {
  const tick = async () => {
    if (document.visibilityState !== 'visible') return
    if (await useNotes.getState().refresh()) onNew()
  }
  const onVisible = () => { if (document.visibilityState === 'visible') tick() }
  // From sw.js: a push arrived, or a notification was tapped while the app was already open.
  const onMessage = e => {
    const d = e.data || {}
    const route = d.type === 'winterarc:open' ? routeOf(d.url) : null
    if (route) location.hash = '#' + route
    if (d.type === 'winterarc:open' || d.type === 'winterarc:push') tick()
  }
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null

  tick()
  const timer = setInterval(tick, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
  sw?.addEventListener('message', onMessage)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    sw?.removeEventListener('message', onMessage)
    useNotes.getState().reset()
  }
}
