import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../lib/useApi.js'
import { useLive, useLiveEvent } from '../../lib/events.js'
import { relTime } from '../../lib/feed.js'
import { initials } from '../../lib/chatfmt.js'
import { accessLabel } from '../../lib/roles.js'
import Icon from '../../components/Icon.jsx'
import Bell from '../../components/Bell.jsx'

// A coach's conversations, one per client: most recent first, with unread counts and who is online.
// English-only, like the other coach screens.
export default function Inbox() {
  const nav = useNavigate()
  const { data, error, reload } = useApi('/api/chat/threads')
  const presence = useLive(s => s.presence)
  const [q, setQ] = useState('')
  useLiveEvent('message', reload)
  useLiveEvent('read', reload)
  useLiveEvent('resync', reload)

  const all = data?.threads || []
  const needle = q.trim().toLowerCase()
  const threads = all.filter(th => !needle || th.peer.name.toLowerCase().includes(needle))

  return <div className="narrow">
    <div className="hdr">
      <div><h1>Chat</h1><div className="sub">{data ? (data.unread ? `${data.unread} unread` : 'All caught up') : 'Loading…'}</div></div>
      <Bell />
    </div>
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}
    {all.length > 4 && <input className="input" placeholder="Find a client" aria-label="Find a client" value={q}
      onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />}

    <div className="list">
      {threads.map(th => {
        const online = (presence[th.peer.id] || th.peer).online
        return <div key={th.peer.id} className="item" onClick={() => nav('/chat/' + th.peer.id)}>
          <span className="avatar" aria-hidden="true">{initials(th.peer.name)}{online && <i className="online-dot" />}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row between" style={{ gap: 8 }}>
              <span className="tt ellipsis">{th.peer.name}</span>
              {th.last && <span className="ss" style={{ flex: 'none' }}>{relTime(th.last.created)}</span>}
            </div>
            <div className="row between" style={{ gap: 8 }}>
              <span className={'ss ellipsis' + (th.unread ? ' unread' : '')}>
                {th.last ? (th.last.from === th.peer.id ? '' : 'You: ') + th.last.preview
                  : th.canSend ? 'No messages yet' : accessLabel(th.peer.access)}
              </span>
              {th.unread > 0 && <span className="badge" aria-label={`${th.unread} unread`}>{th.unread}</span>}
            </div>
          </div>
        </div>
      })}
      {data && !threads.length && <div className="empty"><div className="ico"><Icon name="chat" /></div>
        {all.length ? 'No clients match.' : 'Invite a client to start chatting.'}</div>}
    </div>
  </div>
}
