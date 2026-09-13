// Who may use the platform, and why not. Pure: every function takes the records it needs and
// a `now` in milliseconds, so the lock and expiry rules are testable without a clock or a disk.
//
// Access is DERIVED, never stored. An account is not "locked" by a job that runs at midnight —
// it is expired the moment `paidUntil` passes, on every request. A missed or crashed scheduler
// can delay a reminder, but it can never leave an unpaid account open.
import { DAY } from './time.js'

export const COACH_TERM_DAYS = 365
export const CLIENT_TERM_DAYS = 30
export const COACH_REMIND_DAYS = 15
export const CLIENT_REMIND_DAYS = 7

export function roleOf(user, adminUids = []) {
  if (!user) return null
  if (user.admin === true || adminUids.includes(user.id)) return 'superadmin'
  return user.role === 'coach' ? 'coach' : 'client'
}

// Whole days left before `until`, rounded up, negative once it has passed. Null if never paid.
export const daysLeft = (until, now) => (until ? Math.ceil((until - now) / DAY) : null)

export const isPaid = (until, now) => !!until && until > now

// Most severe reason first: an account that is both disabled and unpaid reads as disabled.
export function coachAccess(coach, now) {
  if (!coach) return 'missing'
  if (coach.disabled) return 'disabled'
  if (coach.suspended) return 'suspended'
  if (coach.locked) return 'locked'
  if (!isPaid(coach.paidUntil, now)) return 'expired'
  return 'active'
}

// A client is never more active than the coach they belong to — a coach who stops paying
// takes every client with them, without anyone having to lock those clients one by one.
export function clientAccess(client, coach, now) {
  if (!client) return 'missing'
  if (client.disabled) return 'disabled'
  if (coachAccess(coach, now) !== 'active') return 'coach_inactive'
  if (coach.clientsLocked || client.locked) return 'locked'
  if (!isPaid(client.paidUntil, now)) return 'expired'
  return 'active'
}

export function accessOf(user, users, now, adminUids = []) {
  const role = roleOf(user, adminUids)
  if (role === 'superadmin') return user.disabled ? 'disabled' : 'active'
  if (role === 'coach') return coachAccess(user, now)
  return clientAccess(user, users.find(u => u.id === user.coachId) || null, now)
}

// Renewing early extends from the current expiry; renewing after a lapse starts from now.
// Paying on time never loses days, and paying late never back-dates access.
export const extendFrom = (until, now, days) => Math.max(until || 0, now) + days * DAY

// A renewal reminder is due inside the window before expiry, and only once per expiry date.
// `sentFor` records which expiry the last reminder was about, so renewing (which moves the
// date) re-arms it for the next term instead of needing a flag to be cleared.
export function reminderDue(until, now, windowDays, sentFor) {
  if (!until || until <= now) return false
  if (until - now > windowDays * DAY) return false
  return sentFor !== until
}

// True once, on the first check after the term runs out.
export const expiryDue = (until, now, sentFor) => !!until && until <= now && sentFor !== until
