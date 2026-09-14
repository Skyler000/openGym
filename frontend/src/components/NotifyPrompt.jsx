import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { pushEnv, enablePush } from '../lib/push.js'
import { promptKind, PROMPT_SNOOZE_DAYS } from '../lib/pushprompt.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// Asks for notifications where they matter — the chat screens and the coach screens. A message only
// reaches a closed app on a device that has been subscribed, and a switch in Settings is one few find.
const SNOOZE_KEY = 'winterarc_notify_prompt_until'
const readSnooze = () => { try { return +localStorage.getItem(SNOOZE_KEY) || 0 } catch { return 0 } }

export default function NotifyPrompt() {
  const user = useStore(s => s.user)
  const [env, setEnv] = useState(null)
  const [snoozedUntil, setSnoozedUntil] = useState(readSnooze)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (user?.id) pushEnv().then(setEnv).catch(() => {}) }, [user?.id])

  const kind = user ? promptKind(env, { snoozedUntil }) : null
  if (!kind) return null

  const snooze = () => {
    const until = Date.now() + PROMPT_SNOOZE_DAYS * 86400000
    try { localStorage.setItem(SNOOZE_KEY, String(until)) } catch { /* private mode: hidden for this visit */ }
    setSnoozedUntil(until)
  }
  // Called straight from the tap: iOS only shows the permission prompt in response to one.
  const turnOn = async () => {
    setBusy(true)
    try {
      await enablePush()
      useUI.getState().toast(t('Notifications on'))
    } catch (e) {
      useUI.getState().toast(e.message || t('Could not change notification settings'))
    }
    setEnv(await pushEnv().catch(() => env))
    setBusy(false)
  }

  const [title, body] = {
    enable: [t('Get message notifications'), t('Turn them on to hear about new messages and updates, even when WinterARC is closed.')],
    install: [t('Get message notifications'), t('On iPhone, notifications need WinterARC on your Home Screen: tap Share, then Add to Home Screen, and open it from there.')],
    blocked: [t('Notifications are blocked'), t('Allow notifications for WinterARC in your phone’s settings to hear about new messages.')]
  }[kind]

  return <div className="card" role="region" aria-label={title}>
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span className="lrow-i" style={{ background: kind === 'blocked' ? 'var(--orange)' : 'var(--acc)', flex: 'none' }}><Icon name="bell" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="small muted" style={{ marginTop: 2, lineHeight: 1.45 }}>{body}</div>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {kind === 'enable' && <Button size="sm" variant="primary" icon="bell" disabled={busy} onClick={turnOn}>{t('Turn on')}</Button>}
          <Button size="sm" variant="ghost" onClick={snooze}>{t('Not now')}</Button>
        </div>
      </div>
    </div>
  </div>
}
