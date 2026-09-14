import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHub } from '../lib/hub.js'
import { kindOf, buildMessage, preview, unreadFor, markRead, search, pageOf, MAX_TEXT } from '../lib/chat.js'
import { rosterWeekly } from '../lib/stats.js'

const fakeRes = () => ({ out: [], write(c) { this.out.push(c) } })

test('hub: online while any stream is open, offline after the last one closes', () => {
  const hub = createHub()
  const a = fakeRes(), b = fakeRes()
  assert.equal(hub.add('u1', a), true)       // came online
  assert.equal(hub.add('u1', b), false)      // a second tab
  assert.equal(hub.isOnline('u1'), true)
  assert.equal(hub.remove('u1', a, 100), false)
  assert.equal(hub.isOnline('u1'), true)
  assert.equal(hub.remove('u1', b, 200), true)  // went offline
  assert.equal(hub.isOnline('u1'), false)
  assert.equal(hub.lastSeen('u1'), 200)
  assert.equal(hub.remove('u1', b, 300), false) // already gone
  assert.equal(hub.size(), 0)
})

test('hub: publish reaches every tab of that user and nobody else', () => {
  const hub = createHub()
  const a = fakeRes(), b = fakeRes(), other = fakeRes()
  hub.add('u1', a); hub.add('u1', b); hub.add('u2', other)
  assert.equal(hub.publish('u1', 'message', { id: 'm1' }), 2)
  assert.deepEqual(a.out, ['event: message\ndata: {"id":"m1"}\n\n'])
  assert.deepEqual(b.out, a.out)
  assert.deepEqual(other.out, [])
  assert.equal(hub.publish('nobody', 'message', {}), 0)
  hub.ping()
  assert.equal(other.out[0], ': ping\n\n')
})

test('hub: a stream that throws on write does not stop the others', () => {
  const hub = createHub()
  const broken = { write() { throw new Error('closed') } }, ok = fakeRes()
  hub.add('u1', broken); hub.add('u1', ok)
  assert.equal(hub.publish('u1', 'x', 1), 2)
  assert.equal(ok.out.length, 1)
})

test('kindOf sorts attachments into photos, voice notes and documents', () => {
  assert.equal(kindOf('image/png'), 'photo')
  assert.equal(kindOf('audio/webm'), 'voice')
  assert.equal(kindOf('application/pdf'), 'file')
  assert.equal(kindOf(undefined), 'file')
})

test('buildMessage: trims text, caps its length, and needs text or a file', () => {
  const ctx = { id: 'm1', now: 5 }
  assert.deepEqual(buildMessage({ from: 'a', to: 'b', text: '  hi\r\nthere  ' }, ctx).message,
    { id: 'm1', from: 'a', to: 'b', created: 5, readAt: null, kind: 'text', text: 'hi\nthere' })
  assert.equal(buildMessage({ from: 'a', to: 'b', text: '   ' }, ctx).error, 'Type a message or attach a file.')
  assert.equal(buildMessage({ from: 'a', to: 'b', text: 'x'.repeat(MAX_TEXT + 50) }, ctx).message.text.length, MAX_TEXT)
})

test('buildMessage: attachments keep only their public metadata; voice notes keep a sane duration', () => {
  const media = { id: 'f1', mime: 'audio/webm', name: 'note.webm', size: 900, owner: 'a', peer: 'b', purpose: 'chat' }
  const m = buildMessage({ from: 'a', to: 'b', media, duration: 7.6 }, { id: 'm2', now: 1 }).message
  assert.equal(m.kind, 'voice')
  assert.deepEqual(m.media, { id: 'f1', mime: 'audio/webm', name: 'note.webm', size: 900, duration: 8 })
  const photo = buildMessage({ from: 'a', to: 'b', media: { ...media, mime: 'image/jpeg' }, duration: 9 }, { id: 'm3', now: 1 }).message
  assert.equal(photo.kind, 'photo')
  assert.equal(photo.media.duration, undefined)
  assert.equal(buildMessage({ from: 'a', to: 'b', media, duration: 99999 }, { id: 'm4', now: 1 }).message.media.duration, 3600)
})

test('preview describes text, photos, voice notes and documents', () => {
  assert.equal(preview({ text: 'Great session today' }), 'Great session today')
  assert.equal(preview({ text: 'y'.repeat(100) }).length, 80)
  assert.equal(preview({ kind: 'photo' }), '📷 Photo')
  assert.equal(preview({ kind: 'voice' }), '🎤 Voice message')
  assert.equal(preview({ kind: 'file', media: { name: 'diet.pdf' } }), '📄 diet.pdf')
  assert.equal(preview(null), '')
})

test('unread counts and read receipts only touch what the peer sent to me', () => {
  const msgs = [
    { id: '1', from: 'c', to: 'u', readAt: null },
    { id: '2', from: 'u', to: 'c', readAt: null },
    { id: '3', from: 'c', to: 'u', readAt: 7 },
    { id: '4', from: 'c', to: 'u', readAt: null }
  ]
  assert.equal(unreadFor(msgs, 'u'), 2)
  assert.equal(unreadFor(msgs, 'c'), 1)
  assert.deepEqual(markRead(msgs, 'u', 'c', 50), ['1', '4'])
  assert.equal(msgs[2].readAt, 7)          // an old receipt keeps its time
  assert.equal(msgs[1].readAt, null)       // my own message isn't marked by me reading
  assert.equal(unreadFor(msgs, 'u'), 0)
  assert.deepEqual(markRead(msgs, 'u', 'c', 60), [])
})

test('search matches every word, in text or file names, newest first', () => {
  const msgs = [
    { id: '1', text: 'Drink a protein shake after training' },
    { id: '2', text: 'Rest day tomorrow' },
    { id: '3', kind: 'file', media: { name: 'Protein-plan.pdf' } },
    { id: '4', text: 'SHAKE it off, protein matters' }
  ]
  assert.deepEqual(search(msgs, 'protein shake').map(m => m.id), ['4', '1'])
  assert.deepEqual(search(msgs, 'protein').map(m => m.id), ['4', '3', '1'])
  assert.deepEqual(search(msgs, 'protein', 1).map(m => m.id), ['4'])
  assert.deepEqual(search(msgs, '   '), [])
})

test('pageOf walks back through history in pages', () => {
  const msgs = Array.from({ length: 5 }, (_, i) => ({ id: 'm' + i }))
  assert.deepEqual(pageOf(msgs, { limit: 2 }), { messages: [msgs[3], msgs[4]], more: true })
  assert.deepEqual(pageOf(msgs, { before: 'm3', limit: 2 }), { messages: [msgs[1], msgs[2]], more: true })
  assert.deepEqual(pageOf(msgs, { before: 'm1', limit: 2 }), { messages: [msgs[0]], more: false })
  assert.deepEqual(pageOf(msgs, { before: 'missing', limit: 10 }).messages.length, 5)
})

test('rosterWeekly sums workouts per week and counts each client once per week', () => {
  const states = [
    { workouts: [{ d: '2026-09-07' }, { d: '2026-09-09' }, { d: '2026-08-31' }] },
    { workouts: [{ d: '2026-09-13' }, { d: '2026-09-20' }] },   // the 20th hasn't happened yet
    null
  ]
  assert.deepEqual(rosterWeekly(states, '2026-09-13', 3), [
    { week: '2026-08-24', workouts: 0, activeClients: 0 },
    { week: '2026-08-31', workouts: 1, activeClients: 1 },
    { week: '2026-09-07', workouts: 3, activeClients: 2 }
  ])
})
