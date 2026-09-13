import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { isCoach, fmtDay } from '../lib/roles.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// Shown in place of the app while an account's access is paused. The sign-in is kept on purpose:
// this screen is how someone finds out why, and "Check again" is how they get straight back in once
// access is restored. A client is told to talk to their coach and nothing about money — the coach
// pays for their place. A coach is told plainly, because they are the one who pays.
function copyFor(user) {
  const a = user.access
  if (isCoach(user)) {
    if (a === 'expired') {
      return [t('Your subscription has expired'), user.paidUntil
        ? t('It ended on {0}. Renew it to continue — your clients can’t train until you do.', fmtDay(user.paidUntil))
        : t('Your subscription isn’t active yet. Contact the platform administrator to activate it.')]
    }
    if (a === 'suspended') return [t('Your account is suspended'), t('Contact the platform administrator for details.')]
    return [t('Your account is locked'), t('Contact the platform administrator to unlock your account.')]
  }
  if (a === 'locked') return [t('Your access is paused'), t('Your coach has paused your access. Contact them to continue.')]
  if (a === 'coach_inactive') return [t('Your access is paused'), t('Your coach’s account isn’t active right now. Contact your coach.')]
  return [t('Your access is paused'), t('Contact your coach to continue training.')]
}

export default function Lock() {
  const user = useStore(s => s.user)
  const refreshMe = useStore(s => s.refreshMe)
  const signOut = useStore(s => s.signOut)
  const [title, body] = copyFor(user)
  return <div className="narrow lock-screen">
    <div className="ico" style={{ color: 'var(--orange)' }}><Icon name="lock" /></div>
    <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.022em' }}>{title}</h1>
    <div className="muted" style={{ maxWidth: 420, margin: '0 auto 22px', lineHeight: 1.5 }}>{body}</div>
    <Button variant="primary" icon="reset" onClick={refreshMe}>{t('Check again')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={signOut}>{t('Sign out')}</Button>
    {user.coachName && <div className="dim small" style={{ marginTop: 18 }}>{t('Coach: {0}', user.coachName)}</div>}
  </div>
}
