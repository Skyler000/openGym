// Live connections. Each open app holds one Server-Sent Events stream per tab; the hub knows who has
// a stream open — which is what "online" means — and writes events down those streams.
//
// In memory only. A restart drops every stream and each app reconnects by itself, so nothing that
// must survive (messages, notifications) is ever only here.

// How recently someone's app must have asked the server anything to count as looking at it. An app on
// screen checks its notification count at least once a minute; one a phone has put to sleep stops.
export const LOOKING_MS = 90000

export function createHub() {
  const streams = new Map()       // uid -> Set<res>
  const lastSeen = new Map()      // uid -> ms, when their last stream closed
  const lastRequest = new Map()   // uid -> ms, their latest signed-in request of any kind

  const send = (res, chunk) => { try { res.write(chunk) } catch { /* the close handler tidies up */ } }
  const isOnline = uid => (streams.get(uid)?.size || 0) > 0

  return {
    // True when this is the user's first open stream: they have just come online.
    add(uid, res) {
      let set = streams.get(uid)
      if (!set) streams.set(uid, set = new Set())
      set.add(res)
      return set.size === 1
    },

    // True when that was the user's last stream: they have just gone offline.
    remove(uid, res, now = Date.now()) {
      const set = streams.get(uid)
      if (!set || !set.delete(res) || set.size) return false
      streams.delete(uid)
      lastSeen.set(uid, now)
      return true
    },

    // Writes one event to every stream the user has open; returns how many that was.
    publish(uid, event, data) {
      const set = streams.get(uid)
      if (!set) return 0
      const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      for (const res of set) send(res, chunk)
      return set.size
    },

    // A comment line on every stream, so proxies don't close one that has been quiet for a while.
    ping() { for (const set of streams.values()) for (const res of set) send(res, ': ping\n\n') },

    // Called for every signed-in request.
    touch(uid, now = Date.now()) { lastRequest.set(uid, now) },

    // Looking at the app right now: a stream is open AND the app has asked something recently. The
    // stream alone isn't enough — a phone can freeze an app in the background and leave its connection
    // open for minutes, and a message sent to it then still has to be pushed.
    isLooking: (uid, now = Date.now(), withinMs = LOOKING_MS) => isOnline(uid) && now - (lastRequest.get(uid) || 0) < withinMs,

    isOnline,
    lastSeen: uid => lastSeen.get(uid) || null,
    size: () => [...streams.values()].reduce((n, set) => n + set.size, 0)
  }
}
