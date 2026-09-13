import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast, copy } from '../../lib/useApi.js'
import { accessLabel, daysText, dueSoon, fmtINR, fmtDay, COACH_REMIND_DAYS } from '../../lib/roles.js'
import { confirmSheet } from '../../sheets.jsx'
import Icon from '../../components/Icon.jsx'
import { Button, Segmented, Switch, Row, Stepper } from '../../components/ui.jsx'

// Super admin home: every coach, what they owe, and who is due to renew.
// An operator screen, so English-only — like the admin dashboard it replaces.

function InviteCoachSheet({ close, onDone }) {
  const [note, setNote] = useState('')
  const [prepaid, setPrepaid] = useState(true)
  const [invite, setInvite] = useState(null)
  const create = async () => {
    const r = await post('/api/sa/coaches/invite', { note, prepaid })
    if (r) { setInvite(r.invite); copy(r.invite.code); onDone() }
  }
  if (invite) return <>
    <h3>Coach invite created</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>Send this code to the coach. They open WinterARC, tap <b>Create new profile</b> and enter it. It works once.</div>
    <div className="card" style={{ textAlign: 'center', padding: 18 }}><div className="code" style={{ fontSize: 22 }}>{invite.code}</div></div>
    <Button variant="primary" icon="link" onClick={() => copy(invite.code)}>Copy code</Button>
    <div style={{ height: 8 }} /><Button onClick={close}>Done</Button>
  </>
  return <>
    <h3>Invite a coach</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>A passkey can only be created by the person who will use it, so coaches join with a one-time code instead of an account you set up for them.</div>
    <input className="input" placeholder="Who is it for? (optional note)" maxLength={80} value={note} onChange={e => setNote(e.target.value)} />
    <div className="sect-b" style={{ margin: '12px 0' }}>
      <Row icon="rupee" iconTint="var(--green)" title="First year paid"
        subtitle={prepaid ? 'Records the annual fee the moment the code is used.' : 'The coach starts expired until you record a payment.'}>
        <Switch checked={prepaid} onChange={setPrepaid} />
      </Row>
    </div>
    <Button variant="primary" icon="personAdd" onClick={create}>Create invite code</Button>
  </>
}

function FeesSheet({ settings, close, onDone }) {
  const [annual, setAnnual] = useState(settings.coachAnnualFee)
  const [monthly, setMonthly] = useState(settings.clientMonthlyFee)
  const save = async () => {
    const r = await post('/api/sa/settings', { coachAnnualFee: annual, clientMonthlyFee: monthly })
    if (r) { toast('Fees updated'); onDone(); close() }
  }
  return <>
    <h3>Fees</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>New fees apply from the next payment or renewal. Nothing already recorded changes.</div>
    <div className="row cfgrow" style={{ marginBottom: 18 }}>
      <Stepper label="Coach, per year (₹)" value={annual} step={500} decimal={false} onChange={setAnnual} />
      <Stepper label="Per client, per month (₹)" value={monthly} step={50} decimal={false} onChange={setMonthly} />
    </div>
    <Button variant="primary" onClick={save}>Save fees</Button>
  </>
}

const FILTERS = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'due', label: 'Due' },
  { value: 'expired', label: 'Expired' }, { value: 'blocked', label: 'Locked' }
]
const isDue = c => c.access === 'active' && dueSoon(c.daysLeft, COACH_REMIND_DAYS)
const matches = (c, f) => f === 'all' ||
  (f === 'active' && c.access === 'active') || (f === 'due' && isDue(c)) || (f === 'expired' && c.access === 'expired') ||
  (f === 'blocked' && ['locked', 'suspended', 'disabled'].includes(c.access))

export default function Coaches() {
  const nav = useNavigate()
  const openSheet = useUI(s => s.openSheet)
  const { data, error, reload } = useApi('/api/sa/coaches')
  const invites = useApi('/api/sa/invites')
  const [filter, setFilter] = useState('all')

  const coaches = data?.coaches || []
  const shown = coaches.filter(c => matches(c, filter)).sort((a, b) => a.name.localeCompare(b.name))
  const active = coaches.filter(c => c.access === 'active').length
  const open = (invites.data?.invites || []).filter(i => !i.usedBy)
  const settings = data?.settings

  const revoke = code => confirmSheet({
    title: 'Revoke this code?', message: code + ' will stop working.', confirmText: 'Revoke', danger: true,
    onConfirm: async () => { if (await post('/api/sa/invites/revoke', { code })) { toast('Code revoked'); invites.reload() } }
  })

  return <div className="narrow">
    <div className="hdr">
      <div><h1>Coaches</h1><div className="sub">{data ? `${coaches.length} coaches · ${active} active` : 'Loading…'}</div></div>
      <button className="iconbtn" aria-label="Invite a coach" onClick={() => openSheet(close => <InviteCoachSheet close={close} onDone={invites.reload} />)}><Icon name="personAdd" /></button>
    </div>
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}

    <Segmented className="seg-range" options={FILTERS} value={filter} onChange={setFilter} />
    <div className="list" style={{ marginTop: 12 }}>
      {shown.map(c => <div key={c.id} className="item" onClick={() => nav('/sa/coach/' + c.id)}>
        <span className="lrow-i" style={{ background: 'var(--indigo)' }}><Icon name="personCircle" /></span>
        <div className="grow">
          <div className="tt">{c.name}</div>
          <div className="ss">{c.clients.active}/{c.clients.total} clients active · {daysText(c.daysLeft)}{c.billing.owed ? ' · owes ' + fmtINR(c.billing.owed) : ''}</div>
        </div>
        <span className={'pill ' + (isDue(c) ? 'due' : c.access)}>{isDue(c) ? `${c.daysLeft}d left` : accessLabel(c.access)}</span>
        <Icon name="chevronRight" className="chev" />
      </div>)}
      {data && !shown.length && <div className="empty"><div className="ico"><Icon name="users" /></div>
        {coaches.length ? 'No coaches match this filter.' : 'No coaches yet — invite your first one.'}</div>}
    </div>

    <h4 className="sec">Unused coach invites</h4>
    <div className="sect-b">
      {open.map(i => <div key={i.code} className="lrow">
        <span className="lrow-m"><span className="lrow-t code">{i.code}</span>
          <span className="lrow-s">{i.note || 'No note'} · {i.prepaid ? 'first year paid' : 'unpaid'} · {fmtDay(Date.parse(i.created))}</span></span>
        <button className="iconbtn" aria-label="Copy code" style={{ width: 32, height: 30, fontSize: 15 }} onClick={() => copy(i.code)}><Icon name="link" /></button>
        <button className="iconbtn" aria-label="Revoke code" style={{ width: 32, height: 30, fontSize: 15, color: 'var(--red)' }} onClick={() => revoke(i.code)}><Icon name="trash" /></button>
      </div>)}
      {!open.length && <div className="lrow"><span className="lrow-s">None. Invite a coach to create one.</span></div>}
    </div>

    {settings && <>
      <h4 className="sec">Fees</h4>
      <div className="sect-b">
        <Row icon="rupee" iconTint="var(--green)" title="Coach subscription" value={fmtINR(settings.coachAnnualFee) + ' / year'} accessory="chevron"
          onClick={() => openSheet(close => <FeesSheet settings={settings} close={close} onDone={reload} />)} />
        <Row icon="person" iconTint="var(--blue)" title="Per client" value={fmtINR(settings.clientMonthlyFee) + ' / month'} accessory="chevron"
          onClick={() => openSheet(close => <FeesSheet settings={settings} close={close} onDone={reload} />)} />
      </div>
    </>}
  </div>
}
