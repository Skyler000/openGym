// Web Push subscribe/unsubscribe — requires a signed-in profile (subscriptions are stored
// server-side per user, same as everything else under /api).
import { api } from './api.js'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported')

const urlBase64ToUint8Array = b64 => {
  const padded = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// The service worker is only registered over HTTPS (main.jsx). Without it there is nothing to
// subscribe with, even in a browser that has the push APIs.
const registration = () => (pushSupported() ? navigator.serviceWorker.getRegistration().catch(() => null) : Promise.resolve(null))
const currentSubscription = async () => {
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription().catch(() => null) : null
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Push notifications are not supported in this browser')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications permission was not granted')
  const reg = await navigator.serviceWorker.ready
  const { key } = await api('/api/push/public-key')
  const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
  await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) })
}

export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await sub.unsubscribe()
  await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
}

export const sendTestPush = () => api('/api/push/test', { method: 'POST', body: '{}' })

// What this device can do about notifications, for deciding what to offer (lib/pushprompt.js).
export async function pushEnv() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true
  const reg = await registration()
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null
  return { ios, standalone, supported: !!reg, permission: pushPermission(), subscribed: !!sub }
}

// Tells the server that this device's subscription belongs to whoever is signed in now. On a phone
// shared between accounts, or after the server's data was reset, alerts would otherwise go to the
// wrong account, or nowhere.
export async function syncPushSubscription() {
  const sub = await currentSubscription()
  if (sub) await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) }).catch(() => {})
}

// On signing out: this device stops receiving the account's alerts. The browser keeps its subscription,
// so whoever signs in here next is matched to it without being asked again.
export async function forgetPushSubscription() {
  const sub = await currentSubscription()
  if (sub) await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
}
