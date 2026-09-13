import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast } from '../../lib/useApi.js'
import { accessLabel, daysText, fmtINR, fmtDay } from '../../lib/roles.js'
import { confirmSheet } from '../../sheets.jsx'
import Icon from '../../components/Icon.jsx'
import Kpi from '../../components/Kpi.jsx'
import { Button, Row, Section, Stepper } from '../../components/ui.jsx'

// One coach, as the platform owner sees them: subscription, what they owe, account controls, and
// the full payment history. Operator screen, English-only.

const LEDGER_LABEL = { coach_annual: 'Annual subscription', client_monthly: 'Client renewal' }

function PaymentSheet({ coach, fee, close, onDone }) {
  const [amount, setAmount] = useState(fee)
  const [note, setNote] = useState('')
  const stillActive = coach.paidUntil && coach.daysLeft > 0
  const save = async () => {
    const r = await post('/api/sa/coach/payment', { id: coach.id, amount, note })
    if (r) { toast('Payment recorded — active until ' + fmtDay(r.coach.paidUntil)); onDone(); close() }
  }
  return <>
    <h3>Record annual payment</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      Adds one year of access{stillActive ? `, counted from the current expiry (${fmtDay(coach.paidUntil)}) so no days are lost` : ', starting today'}.
    </div>
    <div className="row cfgrow" style={{ marginBottom: 12 }}>
      <Stepper label="Amount received (₹)" value={amount} step={500} decimal={false} onChange={setAmount} />
    </div>
    <input className="input" placeholder="Note (optional) — e.g. a UPI reference" maxLength={120} value={note} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="check" onClick={save}>Record payment</Button>
  </>
}

function RenameSheet({ coach, close, onDone }) {
  const [name, setName] = useState(coach.name)
  const save = async () => {
    if (await post('/api/sa/coach/update', { id: coach.id, name })) { toast('Renamed'); onDone(); close() }
  }
  return <>
    <h3>Rename coach</h3>
    <input className="input" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>Save</Button>
  </>
}

export default function CoachDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const openSheet = useUI(s => s.openSheet)
  const { data, error, reload } = useApi('/api/sa/coach?id=' + encodeURIComponent(id))

  const back = <button className="iconbtn" onClick={() => nav('/sa/coaches')} aria-label="Back"><Icon name="chevronLeft" /></button>
  if (error) return <div className="narrow"><div className="hdr">{back}</div><div className="card small" style={{ color: 'var(--red)' }}>{error}</div></div>
  if (!data) return <div className="narrow"><div className="hdr">{back}</div><div className="muted small">Loading…</div></div>

  const c = data.coach
  const nameOf = uid => (data.clients.find(u => u.id === uid) || {}).name
  const act = (action, msg) => async () => { if (await post('/api/sa/coach/status', { id: c.id, action })) { toast(msg); reload() } }
  const confirmAct = (action, title, message, confirmText, msg) =>
    () => confirmSheet({ title, message, confirmText, danger: true, onConfirm: act(action, msg) })

  const settleDues = () => confirmSheet({
    title: `Settle ${fmtINR(c.billing.owed)}?`,
    message: `Marks every client renewal ${c.name} has recorded as paid over to you. Do this once the money has arrived.`,
    confirmText: 'Mark as paid',
    onConfirm: async () => {
      const r = await post('/api/sa/coach/settle', { id: c.id })
      if (r) { toast(`Settled ${r.count} renewal${r.count === 1 ? '' : 's'} · ${fmtINR(r.amount)}`); reload() }
    }
  })
  const del = () => confirmSheet({
    title: 'Delete ' + c.name + '?',
    message: 'Removes the coach’s account, passkeys and plans. Their payment history is kept.',
    confirmText: 'Delete coach', danger: true,
    onConfirm: async () => { if (await post('/api/sa/coach/delete', { id: c.id })) { toast('Coach deleted'); nav('/sa/coaches') } }
  })

  return <div className="narrow">
    <div className="hdr">
      {back}
      <div style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
        <h1 style={{ fontSize: 28, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</h1>
        <div className="sub">Coach since {c.created ? fmtDay(Date.parse(c.created)) : '—'}</div>
      </div>
      <span className={'pill ' + c.access}>{accessLabel(c.access)}</span>
    </div>

    <div className="kpis">
      <Kpi icon="calendar" label="Subscription" value={c.paidUntil ? fmtDay(c.paidUntil) : 'Not paid'} sub={daysText(c.daysLeft)} />
      <Kpi icon="users" label="Clients" value={`${c.clients.active} / ${c.clients.total}`} sub={`${c.clients.expired} expired · ${c.clients.locked} paused`} />
      <Kpi icon="rupee" label="Owes you" value={fmtINR(c.billing.owed)} sub="unpaid client renewals" color={c.billing.owed ? 'var(--orange)' : undefined} />
      <Kpi icon="checks" label="Paid this year" value={fmtINR(c.billing.paidToPlatformYear)} sub={`${c.billing.renewalsThisMonth} client renewals this month`} />
    </div>

    <Section title="Billing">
      <Row icon="rupee" iconTint="var(--green)" title="Record annual payment" subtitle={`Default ${fmtINR(data.settings.coachAnnualFee)} · extends by one year`} accessory="chevron"
        onClick={() => openSheet(close => <PaymentSheet coach={c} fee={data.settings.coachAnnualFee} close={close} onDone={reload} />)} />
      <Row icon="checks" iconTint="var(--blue)" title="Settle client renewals"
        subtitle={c.billing.owed ? `${fmtINR(c.billing.owed)} outstanding` : 'Nothing outstanding'}
        accessory={c.billing.owed ? 'chevron' : 'none'} onClick={c.billing.owed ? settleDues : undefined} />
    </Section>

    <Section title="Account" footer="Locking or suspending a coach pauses every one of their clients too. Pausing clients leaves the coach active.">
      {c.locked
        ? <Row icon="lock" iconTint="var(--green)" title="Unlock account" accessory="chevron" onClick={act('unlock', 'Account unlocked')} />
        : <Row icon="lock" iconTint="var(--orange)" title="Lock account" accessory="chevron"
          onClick={confirmAct('lock', 'Lock ' + c.name + '?', 'The coach and all of their clients lose access until you unlock the account.', 'Lock account', 'Account locked')} />}
      {c.suspended
        ? <Row icon="shield" iconTint="var(--green)" title="Lift suspension" accessory="chevron" onClick={act('unsuspend', 'Suspension lifted')} />
        : <Row icon="shield" iconTint="var(--red)" title="Suspend account" accessory="chevron"
          onClick={confirmAct('suspend', 'Suspend ' + c.name + '?', 'For policy problems rather than payment. The coach and all of their clients lose access.', 'Suspend', 'Account suspended')} />}
      {c.clientsLocked
        ? <Row icon="users" iconTint="var(--green)" title="Restore all clients" accessory="chevron" onClick={act('unlockClients', 'Clients restored')} />
        : <Row icon="users" iconTint="var(--orange)" title="Pause all clients" accessory="chevron"
          onClick={confirmAct('lockClients', 'Pause all of ' + c.name + '’s clients?', 'Every client loses access. The coach keeps theirs.', 'Pause clients', 'Clients paused')} />}
      <Row icon="pencil" iconTint="var(--grey)" title="Rename" accessory="chevron" onClick={() => openSheet(close => <RenameSheet coach={c} close={close} onDone={reload} />)} />
      {c.disabled
        ? <Row icon="person" iconTint="var(--green)" title="Enable sign-in" accessory="chevron" onClick={act('enable', 'Sign-in enabled')} />
        : <Row icon="signOut" iconTint="var(--red)" title="Disable sign-in" danger
          onClick={confirmAct('disable', 'Disable ' + c.name + '?', 'They can no longer sign in at all, and their clients lose access.', 'Disable', 'Sign-in disabled')} />}
      <Row icon="trash" iconTint="var(--red)" title="Delete coach" danger onClick={del} />
    </Section>

    <h4 className="sec">Clients</h4>
    <div className="list">
      {data.clients.map(u => <div key={u.id} className="item" style={{ cursor: 'default' }}>
        <div className="grow"><div className="tt">{u.name}</div><div className="ss">{daysText(u.daysLeft)}</div></div>
        <span className={'pill ' + u.access}>{accessLabel(u.access)}</span>
      </div>)}
      {!data.clients.length && <div className="empty small">No clients yet.</div>}
    </div>

    <h4 className="sec">Payment history</h4>
    <div className="sect-b">
      {data.ledger.map(e => <div key={e.id} className="lrow">
        <span className="lrow-m">
          <span className="lrow-t">{LEDGER_LABEL[e.type] || e.type}</span>
          <span className="lrow-s">{fmtDay(e.created)}{e.clientId ? ' · ' + (nameOf(e.clientId) || 'removed client') : ''}{e.note ? ' · ' + e.note : ''}</span>
        </span>
        <span className="lrow-v money">{fmtINR(e.amount)}</span>
        {e.type === 'client_monthly' && <span className={'pill ' + (e.settled ? 'active' : 'due')}>{e.settled ? 'Paid' : 'Owed'}</span>}
      </div>)}
      {!data.ledger.length && <div className="lrow"><span className="lrow-s">No payments recorded.</span></div>}
    </div>
  </div>
}
