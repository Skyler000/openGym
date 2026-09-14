// Chat state the whole app shares — the unread count behind the tab badge — and sending.
import { create } from 'zustand'
import { api } from './api.js'
import { uploadMedia } from './media.js'
import { onLive } from './events.js'

export const useChatUnread = create(set => ({
  unread: 0,
  byPeer: {},
  apply: threads => set({
    unread: threads.reduce((n, th) => n + th.unread, 0),
    byPeer: Object.fromEntries(threads.map(th => [th.peer.id, th.unread]))
  })
}))

// Debounced: a burst of messages and receipts is one request.
let timer = null
export function refreshChatUnread() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      const { threads } = await api('/api/chat/threads')
      useChatUnread.getState().apply(threads)
    } catch { /* paused or offline: the badge keeps its last count */ }
  }, 250)
}

// Keeps the badge current for an active coach or client; returns the function that stops it.
export function startChatBadge() {
  refreshChatUnread()
  const offs = [onLive('message', refreshChatUnread), onLive('read', refreshChatUnread), onLive('resync', refreshChatUnread)]
  return () => { offs.forEach(off => off()); clearTimeout(timer); useChatUnread.setState({ unread: 0, byPeer: {} }) }
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })

export const sendText = (peer, text) => post('/api/chat/send', { peer, text }).then(r => r.message)

// Uploads the file for this one conversation, then sends it as a message.
export async function sendFile(peer, file, { duration } = {}) {
  const media = await uploadMedia(file, { purpose: 'chat', peer })
  return (await post('/api/chat/send', { peer, mediaId: media.id, duration })).message
}

export const markChatRead = peer => post('/api/chat/read', { peer }).catch(() => null)

// The best voice-note format this browser can record: Opus in WebM on Chrome, Firefox and Android;
// AAC in MP4 on Safari. Both are on the server's upload allowlist.
export function recorderMime() {
  if (typeof MediaRecorder === 'undefined') return null
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || ''
}
