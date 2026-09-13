// Renewal reminders, expiry notices and progress check-ins: which ones are due right now. Pure: it
// returns the notices to send and the marker each account gets, and the caller sends and saves.
//
// A notice describes the state an account is actually in. A coach who paused a client, or an
// administrator who locked a coach, is not then told that the same account's term is running out;
// if that account is unpaused after its term has lapsed, the expiry notice goes out then.
import { roleOf, accessOf, reminderDue, expiryDue, daysLeft, COACH_REMIND_DAYS, CLIENT_REMIND_DAYS } from './access.js'
import { DAY, isoDay, fmtDay, shiftISO } from './time.js'

export const PROGRESS_REMIND_DAYS = 7

const inDays = n => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

// users:       every account (resolved against adminUids for roles)
// lastBodyLog: uid -> 'YYYY-MM-DD' of the client's latest weight, metrics, measurement or photo
// Returns [{ userId, mark, notices: [{ to, type, title, body, url }] }].
export function planReminders(users, now, { adminUids = [], offsetMin = 0, lastBodyLog = () => null } = {}) {
  const out = []
  const admins = users.filter(u => roleOf(u, adminUids) === 'superadmin' && !u.disabled).map(u => u.id)
  const today = isoDay(now, offsetMin)

  for (const u of users) {
    const role = roleOf(u, adminUids)
    if (role === 'superadmin') continue
    const access = accessOf(u, users, now, adminUids)
    const date = u.paidUntil ? fmtDay(u.paidUntil, offsetMin) : null
    const left = daysLeft(u.paidUntil, now)

    if (role === 'coach') {
      if (access === 'active' && reminderDue(u.paidUntil, now, COACH_REMIND_DAYS, u.remindedFor)) {
        out.push({ userId: u.id, mark: { remindedFor: u.paidUntil }, notices: [
          { to: u.id, type: 'payment_due', title: 'Subscription renewal due',
            body: `Your coach subscription ends ${inDays(left)}, on ${date}. Contact the platform administrator to renew — your clients lose access if it lapses.`, url: '#/c' },
          ...admins.map(to => ({ to, type: 'payment_due', title: `${u.name}: renewal due`,
            body: `Coach subscription ends ${inDays(left)}, on ${date}.`, url: `#/sa/coach/${u.id}` }))
        ] })
      } else if (access === 'expired' && expiryDue(u.paidUntil, now, u.expiredFor)) {
        const clients = users.filter(c => c.coachId === u.id && roleOf(c, adminUids) === 'client').length
        out.push({ userId: u.id, mark: { expiredFor: u.paidUntil }, notices: [
          { to: u.id, type: 'payment_expired', title: 'Subscription expired',
            body: 'Your coach subscription has expired and your clients’ access is paused. Contact the platform administrator to renew.', url: null },
          ...admins.map(to => ({ to, type: 'payment_expired', title: `${u.name}: subscription expired`,
            body: `Ended on ${date}. ${clients === 1 ? '1 client is' : `${clients} clients are`} paused until it is renewed.`, url: `#/sa/coach/${u.id}` }))
        ] })
      }
      continue
    }

    // Client. Renewing is the coach's job, so the renewal notices go to the coach, and the client
    // hears only that their access is paused — never a price or a date.
    if (!u.coachId) continue
    if (access === 'active' && reminderDue(u.paidUntil, now, CLIENT_REMIND_DAYS, u.remindedFor)) {
      out.push({ userId: u.id, mark: { remindedFor: u.paidUntil }, notices: [
        { to: u.coachId, type: 'payment_due', title: `${u.name}: renewal due`,
          body: `Access ends ${inDays(left)}, on ${date}. Renew to keep them training.`, url: `#/c/client/${u.id}` }
      ] })
    } else if (access === 'expired' && expiryDue(u.paidUntil, now, u.expiredFor)) {
      out.push({ userId: u.id, mark: { expiredFor: u.paidUntil }, notices: [
        { to: u.coachId, type: 'payment_expired', title: `${u.name}: access expired`,
          body: 'Their access is paused until you renew it.', url: `#/c/client/${u.id}` },
        { to: u.id, type: 'account', title: 'Access paused', body: 'Your access is paused. Contact your coach to continue.', url: null }
      ] })
    }

    // A weekly nudge for an active client who has logged nothing about their body for a week.
    // Counted from sign-up for someone who has never logged, so nobody is nagged on day one.
    if (access === 'active') {
      const since = lastBodyLog(u.id) || (u.created ? isoDay(Date.parse(u.created), offsetMin) : today)
      const quiet = since <= shiftISO(today, -PROGRESS_REMIND_DAYS)
      const nudgedRecently = u.progressRemindedAt && now - u.progressRemindedAt < PROGRESS_REMIND_DAYS * DAY
      if (quiet && !nudgedRecently) {
        out.push({ userId: u.id, mark: { progressRemindedAt: now }, notices: [
          { to: u.id, type: 'progress', title: 'Time for a progress check-in',
            body: 'Log your weight, measurements or a photo so your coach can see how you’re doing.', url: '#/progress' }
        ] })
      }
    }
  }
  return out
}
