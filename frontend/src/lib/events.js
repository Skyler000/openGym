// The live event stream from /api/events: new messages, read receipts, presence and notifications as
// they happen. EventSource reconnects by itself after a drop, and gives up for good on a 401 — which is
// what should happen once the account is signed out.
import { useEffect, useRef } from 'react'
import { create } from 'zustand'

// A tab left in the background lets go of its stream after this long. Nobody is looking, so they show
// as offline and chat reaches them by push instead — and over HTTP/1.1 every open stream holds one of
// the few connections a browser allows to one server, which a handful of tabs would otherwise use up.
const HIDDEN_GRACE_MS = 20000

export const useLive = create(set => ({
  connected: false,
  presence: {},   // uid -> { online, lastSeen }
  setPresence: (id, p) => set(s => ({ presence: { ...s.presence, [id]: p } }))
}))

const listeners = new Map()   // event -> Set<fn>

// Subscribes to one kind of event; returns the unsubscribe function.
export function onLive(event, fn) {
  let set = listeners.get(event)
  if (!set) listeners.set(event, set = new Set())
  set.add(fn)
  return () => set.delete(fn)
}

// The same, for a component: follows the latest handler without resubscribing on every render.
export function useLiveEvent(event, handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => onLive(event, data => ref.current(data)), [event])
}

function emit(event, data) {
  for (const fn of listeners.get(event) || []) {
    try { fn(data) } catch (err) { console.error(err) }
  }
}

const EVENTS = ['message', 'read', 'presence', 'notification']

// Opens the stream for a signed-in account; returns the function that closes it.
// Whenever the stream comes back after being down, 'resync' fires: nothing that happened in between
// was delivered, so each screen fetches its current state again.
export function startLive() {
  if (typeof EventSource === 'undefined') return () => {}
  let es = null
  let hiddenTimer = null
  let connections = 0

  const open = () => {
    if (es) return
    es = new EventSource('/api/events')
    es.addEventListener('open', () => useLive.setState({ connected: true }))
    es.addEventListener('error', () => useLive.setState({ connected: false }))
    // The server says hello at the start of every connection, the browser's own reconnects included.
    es.addEventListener('hello', () => {
      if (connections++ === 0) return
      useLive.setState({ presence: {} })   // presence changes may have been missed as well
      emit('resync', null)
    })
    for (const type of EVENTS) {
      es.addEventListener(type, e => {
        let data
        try { data = JSON.parse(e.data) } catch { return }
        if (type === 'presence') useLive.getState().setPresence(data.id, { online: data.online, lastSeen: data.lastSeen })
        emit(type, data)
      })
    }
  }
  const close = () => {
    if (!es) return
    es.close()
    es = null
    useLive.setState({ connected: false })
  }
  const onVisibility = () => {
    clearTimeout(hiddenTimer)
    if (document.visibilityState === 'hidden') hiddenTimer = setTimeout(close, HIDDEN_GRACE_MS)
    else open()
  }

  open()
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    clearTimeout(hiddenTimer)
    document.removeEventListener('visibilitychange', onVisibility)
    close()
    useLive.setState({ presence: {} })
  }
}
