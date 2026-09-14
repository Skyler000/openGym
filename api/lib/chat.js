// Chat between a coach and one of their own clients. Pure: the routes decide who may talk to whom
// and where a conversation is stored; these decide what a message is and what a thread says.

export const MAX_TEXT = 4000
export const KEEP_MESSAGES = 5000

export function kindOf(mime) {
  if (/^image\//.test(mime || '')) return 'photo'
  if (/^audio\//.test(mime || '')) return 'voice'
  return 'file'
}

// A message from what was sent, or `{ error }`. `media` is the uploaded file's metadata, already
// checked by the caller to belong to this sender and this conversation.
export function buildMessage({ from, to, text, media, duration }, { id, now }) {
  const clean = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT) : ''
  if (!clean && !media) return { error: 'Type a message or attach a file.' }
  const message = { id, from, to, created: now, readAt: null, kind: media ? kindOf(media.mime) : 'text' }
  if (clean) message.text = clean
  if (media) {
    message.media = { id: media.id, mime: media.mime, name: media.name, size: media.size }
    const secs = Math.round(+duration)
    if (message.kind === 'voice' && secs > 0) message.media.duration = Math.min(3600, secs)
  }
  return { message }
}

// What a thread list, or a push notification, shows for a message.
export function preview(m) {
  if (!m) return ''
  if (m.text) return m.text.length > 80 ? m.text.slice(0, 79) + '…' : m.text
  if (m.kind === 'photo') return '📷 Photo'
  if (m.kind === 'voice') return '🎤 Voice message'
  return '📄 ' + (m.media?.name || 'Document')
}

export const unreadFor = (messages, uid) => messages.reduce((n, m) => n + (m.to === uid && !m.readAt ? 1 : 0), 0)

// Marks everything `peer` sent to `uid` as read. Mutates; returns the ids it changed.
export function markRead(messages, uid, peer, now) {
  const ids = []
  for (const m of messages) {
    if (m.to === uid && m.from === peer && !m.readAt) { m.readAt = now; ids.push(m.id) }
  }
  return ids
}

// Newest first. Every word of the query has to appear somewhere in the text or file name.
export function search(messages, q, limit = 50) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const out = []
  for (let i = messages.length - 1; i >= 0 && out.length < limit; i--) {
    const m = messages[i]
    const hay = ((m.text || '') + ' ' + (m.media?.name || '')).toLowerCase()
    if (words.every(w => hay.includes(w))) out.push(m)
  }
  return out
}

// Pages back through history: up to `limit` messages before the message `before`, oldest first.
export function pageOf(messages, { before, limit = 60 } = {}) {
  let end = messages.length
  if (before) {
    const i = messages.findIndex(m => m.id === before)
    if (i >= 0) end = i
  }
  const start = Math.max(0, end - limit)
  return { messages: messages.slice(start, end), more: start > 0 }
}
