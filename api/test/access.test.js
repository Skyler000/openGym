import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY } from '../lib/time.js'
import { roleOf, daysLeft, coachAccess, clientAccess, accessOf, extendFrom, reminderDue, expiryDue } from '../lib/access.js'

const NOW = Date.UTC(2026, 8, 13, 6, 0, 0)

test('roleOf: admin uids and the admin flag make a super admin; everyone else defaults to client', () => {
  assert.equal(roleOf({ id: 'a' }, ['a']), 'superadmin')
  assert.equal(roleOf({ id: 'b', admin: true }), 'superadmin')
  assert.equal(roleOf({ id: 'c', role: 'coach' }), 'coach')
  assert.equal(roleOf({ id: 'd', role: 'client' }), 'client')
  assert.equal(roleOf({ id: 'e' }), 'client')
  assert.equal(roleOf(null), null)
})

test('daysLeft rounds a partial day up and goes negative after expiry', () => {
  assert.equal(daysLeft(null, NOW), null)
  assert.equal(daysLeft(NOW + DAY, NOW), 1)
  assert.equal(daysLeft(NOW + DAY / 2, NOW), 1)
  assert.equal(daysLeft(NOW - DAY, NOW), -1)
})

test('coachAccess: the most severe reason wins', () => {
  const paid = { paidUntil: NOW + 10 * DAY }
  assert.equal(coachAccess(paid, NOW), 'active')
  assert.equal(coachAccess({ paidUntil: NOW - 1 }, NOW), 'expired')
  assert.equal(coachAccess({}, NOW), 'expired')
  assert.equal(coachAccess({ ...paid, locked: true }, NOW), 'locked')
  assert.equal(coachAccess({ ...paid, locked: true, suspended: true }, NOW), 'suspended')
  assert.equal(coachAccess({ ...paid, suspended: true, disabled: true }, NOW), 'disabled')
  assert.equal(coachAccess(null, NOW), 'missing')
})

test('clientAccess: a client is never more active than their coach', () => {
  const coach = { paidUntil: NOW + 100 * DAY }
  const client = { paidUntil: NOW + 5 * DAY }
  assert.equal(clientAccess(client, coach, NOW), 'active')
  assert.equal(clientAccess(client, { paidUntil: NOW - DAY }, NOW), 'coach_inactive')
  assert.equal(clientAccess(client, { ...coach, locked: true }, NOW), 'coach_inactive')
  assert.equal(clientAccess(client, null, NOW), 'coach_inactive')
  assert.equal(clientAccess(client, { ...coach, clientsLocked: true }, NOW), 'locked')
  assert.equal(clientAccess({ ...client, locked: true }, coach, NOW), 'locked')
  assert.equal(clientAccess({ paidUntil: NOW - 1 }, coach, NOW), 'expired')
  assert.equal(clientAccess({ ...client, disabled: true }, coach, NOW), 'disabled')
})

test('accessOf dispatches on role and looks up the client’s coach', () => {
  const coach = { id: 'c1', role: 'coach', paidUntil: NOW + DAY }
  const client = { id: 'u1', role: 'client', coachId: 'c1', paidUntil: NOW + DAY }
  const admin = { id: 'sa' }
  const users = [coach, client, admin]
  assert.equal(accessOf(admin, users, NOW, ['sa']), 'active')
  assert.equal(accessOf(coach, users, NOW), 'active')
  assert.equal(accessOf(client, users, NOW), 'active')
  assert.equal(accessOf({ ...client, coachId: 'nobody' }, users, NOW), 'coach_inactive')
})

test('extendFrom: early renewal keeps unused days, late renewal starts from now', () => {
  assert.equal(extendFrom(NOW + 5 * DAY, NOW, 30), NOW + 35 * DAY)
  assert.equal(extendFrom(NOW - 5 * DAY, NOW, 30), NOW + 30 * DAY)
  assert.equal(extendFrom(null, NOW, 365), NOW + 365 * DAY)
})

test('reminderDue fires once per expiry date, and only inside the window', () => {
  const until = NOW + 10 * DAY
  assert.equal(reminderDue(until, NOW, 15, undefined), true)
  assert.equal(reminderDue(until, NOW, 15, until), false)          // already sent for this date
  assert.equal(reminderDue(until, NOW, 7, undefined), false)       // outside a 7-day window
  assert.equal(reminderDue(NOW - DAY, NOW, 15, undefined), false)  // already expired
  assert.equal(reminderDue(null, NOW, 15), false)
  // Renewing moves the expiry, which re-arms the reminder for the next term.
  assert.equal(reminderDue(until + 30 * DAY, NOW + 30 * DAY, 15, until), true)
})

test('expiryDue fires once, on the first check after the term runs out', () => {
  assert.equal(expiryDue(NOW - DAY, NOW, undefined), true)
  assert.equal(expiryDue(NOW - DAY, NOW, NOW - DAY), false)
  assert.equal(expiryDue(NOW + DAY, NOW, undefined), false)
  assert.equal(expiryDue(null, NOW), false)
})
