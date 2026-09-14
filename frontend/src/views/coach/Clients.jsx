import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast, copy } from '../../lib/useApi.js'
import { accessLabel, daysText, dueSoon, pct, fmtINR, fmtDay, CLIENT_REMIND_DAYS } from '../../lib/roles.js'
import { todayISO } from '../../lib/format.js'
import { confirmSheet } from '../../sheets.jsx'
import { GroupsSection } from './Groups.jsx'
import Icon from '../../components/Icon.jsx'
import { Button, Segmented } from '../../components/ui.jsx'

// Coach home: the roster, who is training right now, and who needs renewing. English-only.

const DAY = 86400000
export const relDay = iso => {
  const days = Math.round((Date.parse(todayISO()) - Date.parse(iso)) / DAY)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + 'd ago'
}

function InviteClientSheet({ fee, close, onDone }) {
  const [note, setNote] = useState('')
  const [invite, setInvite] = useState(null)
  const create = async () => {
    const r = await post('/api/coach/invites/new', { note })
    if (r) { setInvite(r.invite); copy(r.invite.code); onDone() }
  }
  if (invite) return <>
    <h3>Client invite created</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>Send this code to your client. They open WinterARC, tap <b>Create new profile</b> and enter it. It works once.</div>
    <div className="card" style={{ textAlign: 'center', padding: 18 }}><div className="code" style={{ fontSize: 22 }}>{invite.code}</div></div>
    <Button variant="primary" icon="link" onClick={() => copy(invite.code)}>Copy code</Button>
    <div style={{ height: 8 }} /><Button onClick={close}>Done</Button>
  </>
  return <>
    <h3>Invite a client</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      When they sign up with the code their first month starts, and {fmtINR(fee)} is added to what you owe the platform. Your client never sees any amounts.
    </div>
    <input className="input" placeholder="Who is it for? (optional note)" maxLength={80} value={note} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="personAdd" onClick={create}>Create invite code</Button>
  </>
}

const FILTERS = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'due', label: 'Due' },
  { value: 'expired', label: 'Expired' }, { value: 'locked', label: 'Paused' }
]

export default function Clients() {
  const nav = useNavigate()
  const openSheet = useUI(s => s.openSheet)
  const { data, error } = useApi('/api/coach/clients')
  const invites = useApi('/api/coach/invites')
  const [filter, setFilter] = useState('all')

  const clients = data?.clients || []
  const isDue = c => c.access === 'active' && dueSoon(c.daysLeft, CLIENT_REMIND_DAYS)
  const matches = c => filter === 'all' || (filter === 'active' && c.access === 'active') || (filter === 'due' && isDue(c)) ||
    (filter === 'expired' && c.access === 'expired') || (filter === 'locked' && c.access === 'locked')
  // People training right now first, then alphabetical.
  const shown = clients.filter(matches).sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || a.name.localeCompare(b.name))
  const open = (invites.data?.invites || []).filter(i => !i.usedBy)
  const fee = data?.fee ?? invites.data?.fee ?? 0
  const activeCount = clients.filter(c => c.access === 'active').length

  const revoke = code => confirmSheet({
    title: 'Revoke this code?', message: code + ' will stop working.', confirmText: 'Revoke', danger: true,
    onConfirm: async () => { if (await post('/api/coach/invites/revoke', { code })) { toast('Code revoked'); invites.reload() } }
  })

  return <div className="narrow">
    <div className="hdr">
      <div><h1>Clients</h1><div className="sub">{data ? `${activeCount} active · ${clients.length} total` : 'Loading…'}</div></div>
      <button className="iconbtn" aria-label="Invite a client" onClick={() => openSheet(close => <InviteClientSheet fee={fee} close={close} onDone={invites.reload} />)}><Icon name="personAdd" /></button>
    </div>

    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}

    <Segmented className="seg-range" options={FILTERS} value={filter} onChange={setFilter} />
    <div className="list" style={{ marginTop: 12 }}>
      {shown.map(c => <div key={c.id} className="item" onClick={() => nav('/c/client/' + c.id)}>
        <span className="lrow-i" style={{ background: c.live ? 'var(--acc)' : 'var(--surface-3)' }}><Icon name={c.live ? 'flame' : 'person'} /></span>
        <div className="grow">
          <div className="tt">{c.name}</div>
          <div className="ss">{c.live
            ? 'Training now · ' + c.live.name
            : [c.lastWorkout ? 'last workout ' + relDay(c.lastWorkout) : 'no workouts yet',
              c.assignment?.rate != null ? pct(c.assignment.rate) + ' on plan' : null,
              daysText(c.daysLeft)].filter(Boolean).join(' · ')}</div>
        </div>
        <span className={'pill ' + (isDue(c) ? 'due' : c.access)}>{isDue(c) ? `${c.daysLeft}d left` : accessLabel(c.access)}</span>
        <Icon name="chevronRight" className="chev" />
      </div>)}
      {data && !shown.length && <div className="empty"><div className="ico"><Icon name="users" /></div>
        {clients.length ? 'No clients match this filter.' : 'No clients yet — create an invite code to add your first.'}</div>}
    </div>

    <GroupsSection clients={clients} />

    <h4 className="sec">Unused invite codes</h4>
    <div className="sect-b">
      {open.map(i => <div key={i.code} className="lrow">
        <span className="lrow-m"><span className="lrow-t code">{i.code}</span>
          <span className="lrow-s">{i.note || 'No note'} · created {fmtDay(Date.parse(i.created))}</span></span>
        <button className="iconbtn" aria-label="Copy code" style={{ width: 32, height: 30, fontSize: 15 }} onClick={() => copy(i.code)}><Icon name="link" /></button>
        <button className="iconbtn" aria-label="Revoke code" style={{ width: 32, height: 30, fontSize: 15, color: 'var(--red)' }} onClick={() => revoke(i.code)}><Icon name="trash" /></button>
      </div>)}
      {!open.length && <div className="lrow"><span className="lrow-s">None. Tap the invite button above to create one.</span></div>}
    </div>
  </div>
}
