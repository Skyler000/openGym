import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY } from '../lib/time.js'
import { planReminders, PROGRESS_REMIND_DAYS } from '../lib/reminders.js'

const NOW = Date.UTC(2026, 8, 13, 6, 0, 0)
const iso = ms => new Date(ms).toISOString()

// A roster where nothing is due: a coach 200 days out, a client 20 days out who weighed in today.
function roster() {
  return [
    { id: 'sa', name: 'Sam', admin: true, created: iso(NOW - 60 * DAY) },
    { id: 'c1', name: 'Riya', role: 'coach', paidUntil: NOW + 200 * DAY, created: iso(NOW - 60 * DAY) },
    { id: 'u1', name: 'Arjun', role: 'client', coachId: 'c1', paidUntil: NOW + 20 * DAY, created: iso(NOW - 60 * DAY) }
  ]
}
const plan = (users, now = NOW, lastBodyLog = () => '2026-09-13') => planReminders(users, now, { lastBodyLog, offsetMin: 330 })
const notices = items => items.flatMap(i => i.notices)
const who = items => notices(items).map(n => [n.to, n.type])
const find = (users, id) => users.find(u => u.id === id)
// Saves the markers the way the scheduler does, so the next run sees them.
const apply = (users, items) => { for (const i of items) Object.assign(find(users, i.userId), i.mark) }

test('nothing is due for accounts that are paid up and logging', () => {
  assert.deepEqual(plan(roster()), [])
})

test('a coach inside 15 days is reminded once, and so is every super admin', () => {
  const users = roster()
  find(users, 'c1').paidUntil = NOW + 10 * DAY
  const first = plan(users)
  assert.deepEqual(who(first), [['c1', 'payment_due'], ['sa', 'payment_due']])
  const [toCoach, toAdmin] = notices(first)
  assert.match(toCoach.body, /in 10 days/)
  assert.equal(toAdmin.title, 'Riya: renewal due')
  assert.equal(toAdmin.url, '#/sa/coach/c1')
  apply(users, first)
  assert.deepEqual(plan(users), [])
})

test('renewing moves the expiry, which re-arms the coach reminder for the next term', () => {
  const users = roster()
  const c = find(users, 'c1')
  c.paidUntil = NOW + 10 * DAY
  apply(users, plan(users))
  c.paidUntil += 365 * DAY
  const later = NOW + 360 * DAY
  assert.equal(notices(plan(users, later)).filter(n => n.to === 'c1' && n.type === 'payment_due').length, 1)
})

test('an expired coach gets one expiry notice, and the admin hears how many clients are paused', () => {
  const users = roster()
  find(users, 'c1').paidUntil = NOW - DAY
  const items = plan(users)
  assert.deepEqual(who(items), [['c1', 'payment_expired'], ['sa', 'payment_expired']])
  assert.match(notices(items)[1].body, /1 client is paused/)
  apply(users, items)
  assert.deepEqual(plan(users), [])
})

test('a locked coach is not told their term is ending, and hears it has expired once unlocked', () => {
  const users = roster()
  const c = find(users, 'c1')
  Object.assign(c, { paidUntil: NOW + 5 * DAY, locked: true })
  assert.deepEqual(plan(users), [])
  c.paidUntil = NOW - DAY
  assert.deepEqual(plan(users), [])
  c.locked = false
  assert.deepEqual(who(plan(users)), [['c1', 'payment_expired'], ['sa', 'payment_expired']])
})

test('a client inside 7 days: the coach is reminded and the client is told nothing', () => {
  const users = roster()
  find(users, 'u1').paidUntil = NOW + 3 * DAY
  const items = plan(users)
  assert.deepEqual(who(items), [['c1', 'payment_due']])
  assert.equal(notices(items)[0].title, 'Arjun: renewal due')
  assert.equal(notices(items)[0].url, '#/c/client/u1')
})

test('an expired client: the coach gets the details, the client a notice with no price or date', () => {
  const users = roster()
  find(users, 'u1').paidUntil = NOW - 2 * DAY
  const items = plan(users)
  assert.deepEqual(who(items), [['c1', 'payment_expired'], ['u1', 'account']])
  const toClient = notices(items)[1]
  assert.doesNotMatch(toClient.title + ' ' + toClient.body, /₹|\d|renew|subscription/i)
})

test('a paused client is not reminded about renewal', () => {
  const users = roster()
  Object.assign(find(users, 'u1'), { paidUntil: NOW + 3 * DAY, locked: true })
  assert.deepEqual(plan(users), [])
  find(users, 'u1').locked = false
  find(users, 'c1').clientsLocked = true
  assert.deepEqual(plan(users), [])
})

test('progress check-in: after a quiet week, at most once a week, and not in someone’s first week', () => {
  const users = roster()
  const quiet = () => '2026-09-01'
  const first = plan(users, NOW, quiet)
  assert.deepEqual(who(first), [['u1', 'progress']])
  apply(users, first)
  assert.deepEqual(plan(users, NOW + 3 * DAY, quiet), [])
  assert.deepEqual(who(plan(users, NOW + PROGRESS_REMIND_DAYS * DAY, quiet)), [['u1', 'progress']])

  const fresh = roster()
  find(fresh, 'u1').created = iso(NOW - 2 * DAY)
  assert.deepEqual(plan(fresh, NOW, () => null), [])
})

test('a disabled super admin is not sent coach reminders', () => {
  const users = roster()
  find(users, 'sa').disabled = true
  find(users, 'c1').paidUntil = NOW + 10 * DAY
  assert.deepEqual(who(plan(users)), [['c1', 'payment_due']])
})
