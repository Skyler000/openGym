// Live connections. Each open app holds one Server-Sent Events stream per tab; the hub knows who has
// a stream open — which is what "online" means — and writes events down those streams.
//
// In memory only. A restart drops every stream and each app reconnects by itself, so nothing that
// must survive (messages, notifications) is ever only here.
export function createHub() {
  const streams = new Map()    // uid -> Set<res>
  const lastSeen = new Map()   // uid -> ms, when their last stream closed

  const send = (res, chunk) => { try { res.write(chunk) } catch { /* the close handler tidies up */ } }

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

    isOnline: uid => (streams.get(uid)?.size || 0) > 0,
    lastSeen: uid => lastSeen.get(uid) || null,
    size: () => [...streams.values()].reduce((n, set) => n + set.size, 0)
  }
}
