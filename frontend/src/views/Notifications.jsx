import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useApi, post } from '../lib/useApi.js'
import { useNotes } from '../lib/notifications.js'
import { routeOf, noteIcon, noteTint, relTime } from '../lib/feed.js'
import { homeRoute } from '../lib/roles.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'

// Everything this account has been told: plans assigned, renewals, reminders, account changes.
// Opening the feed marks it all read; what was new keeps its dot until the screen is left.
// Titles and bodies are written by the server in English and translated here when the app has them.
export default function Notifications() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const { data, error } = useApi('/api/notifications')
  const list = data?.notifications || []

  useEffect(() => {
    if (!data?.unread) return
    post('/api/notifications/read', {}).then(r => { if (r) useNotes.getState().markAllRead() })
  }, [data])

  const open = route => nav(route)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav(homeRoute(user))} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}>
        <h1>{t('Notifications')}</h1>
        {data && <div className="sub">{data.unread ? t('{0} new', data.unread) : t('All caught up')}</div>}
      </div>
    </div>
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}

    {list.length > 0 && <div className="sect-b">
      {list.map(n => {
        const route = routeOf(n.url)
        return <div key={n.id} className={'note' + (n.read ? '' : ' new') + (route ? ' link' : '')}
          role={route ? 'button' : undefined} tabIndex={route ? 0 : undefined}
          onClick={route ? () => open(route) : undefined}
          onKeyDown={route ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(route) } } : undefined}>
          <span className="lrow-i" style={{ background: noteTint(n.type) }}><Icon name={noteIcon(n.type)} /></span>
          <div className="grow">
            <div className="tt">{t(n.title)}</div>
            {n.body && <div className="bd">{t(n.body)}</div>}
            <div className="tm">{relTime(n.created)}</div>
          </div>
          {route && <Icon name="chevronRight" className="chev" />}
        </div>
      })}
    </div>}
    {data && !list.length && <div className="empty"><div className="ico"><Icon name="bell" /></div>{t('No notifications yet.')}</div>}
  </div>
}
