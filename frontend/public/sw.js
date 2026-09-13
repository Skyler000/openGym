/* WinterARC service worker — runtime caching (works with Vite's hashed asset names).
   Media (img/gif) cache-first; everything else network-first with offline fallback. */
const CACHE = 'winterarc-rt-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
})
// Only in-app hash routes are followed from a notification ('#/c/client/abc').
const routeOf = url => (typeof url === 'string' && /^#\/[\w/-]*$/.test(url) ? url : null)

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {}
  e.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'WinterARC', {
      body: data.body || '',
      icon: 'icon-512.png',
      badge: 'icon-180.png',
      tag: data.tag || 'winterarc',
      renotify: true,
      data: { url: routeOf(data.url) }
    }),
    // An open app updates its unread count now rather than on its next poll.
    self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ type: 'winterarc:push' })))
  ]))
})
// Opens the screen the notification is about: inside the app if it is already open, else a new window.
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const route = routeOf(e.notification.data?.url)
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
    const c = clients.find(c => 'focus' in c)
    if (!c) return self.clients.openWindow('./' + (route || ''))
    if (route) c.postMessage({ type: 'winterarc:open', url: route })
    return c.focus()
  }))
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return    // never cache auth/data

  const isMedia = url.pathname.includes('/img/') || url.pathname.includes('/gif/')
  if (isMedia) {
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res })
    )))
  } else {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()))
      return res
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))))
  }
})
