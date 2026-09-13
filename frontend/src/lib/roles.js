// The role and access vocabulary every view shares. It mirrors api/lib/access.js, but the server is
// the authority: this only decides what to show, never what anyone is allowed to do.
export const isSuperAdmin = u => u?.role === 'superadmin'
export const isCoach = u => u?.role === 'coach'
export const isClient = u => u?.role === 'client'
// A guest has no account, so there is nothing to pause.
export const isActive = u => !u || !u.access || u.access === 'active'

// Where each role lands after signing in.
export const homeRoute = u => (isSuperAdmin(u) ? '/sa' : isCoach(u) ? '/c' : '/home')

export const COACH_REMIND_DAYS = 15
export const CLIENT_REMIND_DAYS = 7

const ACCESS_LABEL = {
  active: 'Active', expired: 'Expired', locked: 'Locked', suspended: 'Suspended',
  disabled: 'Disabled', coach_inactive: 'Coach inactive', missing: 'Unknown'
}
export const accessLabel = a => ACCESS_LABEL[a] || a

// Inside the renewal window but not yet lapsed.
export const dueSoon = (daysLeft, windowDays) => daysLeft != null && daysLeft >= 0 && daysLeft <= windowDays

// Indian grouping (₹1,50,000), because the fees are set in rupees.
export const fmtINR = n => '₹' + Math.round(n || 0).toLocaleString('en-IN')
export const fmtDay = ms => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const pct = r => (r == null ? '—' : Math.round(r * 100) + '%')

export const daysText = d => (d == null ? 'never paid' : d < 0 ? `expired ${-d}d ago` : d === 0 ? 'expires today' : `${d}d left`)
