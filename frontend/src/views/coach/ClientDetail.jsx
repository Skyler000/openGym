import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast } from '../../lib/useApi.js'
import { accessLabel, daysText, pct, fmtINR, fmtDay } from '../../lib/roles.js'
import { fmtDate, fmtNum, fmtVol } from '../../lib/format.js'
import { setsDone, workoutVolume, setLabel } from '../../lib/history.js'
import { EXIDX } from '../../lib/exercises.js'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../../lib/muscles.js'
import { e1rmSeries } from '../../lib/onerm.js'
import { mediaUrl } from '../../lib/media.js'
import { confirmSheet } from '../../sheets.jsx'
import { assignSheet } from './assign.jsx'
import { relDay } from './Clients.jsx'
import LineChart from '../../components/LineChart.jsx'
import Heatmap from '../../components/Heatmap.jsx'
import BodyMap from '../../components/BodyMap.jsx'
import Icon from '../../components/Icon.jsx'
import Kpi from '../../components/Kpi.jsx'
import { MeasureTable, sortByDay } from '../../components/BodyStats.jsx'
import { Button, Segmented, Stepper } from '../../components/ui.jsx'

// One client, read from their synced state: training, body metrics, plans and billing.
// Nothing here writes to the client's own data — a coach reads it, and acts through renew / lock /
// assign / notes, which the server applies. English-only operator screen.

const DAY = 86400000
const TABS = [
  { value: 'overview', label: 'Overview' }, { value: 'progress', label: 'Progress' },
  { value: 'workouts', label: 'Workouts' }, { value: 'plans', label: 'Plans' }, { value: 'payments', label: 'Billing' }
]
const exName = (id, S) => (S.customEx || []).find(c => c.id === id)?.n || EXIDX[id]?.n || 'Exercise'
const points = (list, key) => sortByDay(list).filter(x => x[key] != null).map(x => ({ t: x.t || Date.parse(x.d), y: x[key], d: x.d }))

// The lifts a client does most often with a load on the bar — the ones worth charting.
function topLifts(workouts, n) {
  const count = {}
  for (const w of workouts) for (const e of w.entries || []) {
    if ((e.sets || []).some(s => s.done && s.w > 0 && s.r > 0)) count[e.id] = (count[e.id] || 0) + 1
  }
  return Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, n)
}

export function RenewSheet({ client, fee, close, onDone }) {
  const [received, setReceived] = useState(0)
  const save = async () => {
    const r = await post('/api/coach/client/renew', { id: client.id, received })
    if (r) { toast('Renewed — ' + daysText(r.client.daysLeft)); onDone(); close() }
  }
  return <>
    <h3>Renew {client.name}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      Adds 30 days of access{client.daysLeft > 0 ? ', counted from their current expiry' : ', starting today'}. {fmtINR(fee)} is added to what you owe the platform.
    </div>
    <div className="row cfgrow" style={{ marginBottom: 6 }}>
      <Stepper label="They paid you (₹, optional)" value={received} step={100} decimal={false} onChange={setReceived} />
    </div>
    <div className="dim small" style={{ marginBottom: 14 }}>Only used to show your own earnings. Your client never sees any amounts.</div>
    <Button variant="primary" icon="check" onClick={save}>Renew for 30 days</Button>
  </>
}

function WorkoutSheet({ w, S }) {
  return <>
    <h3>{w.name}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{fmtDate(w.d, true)} · {setsDone(w)} sets · {fmtVol(w.vol ?? workoutVolume(w), S.unit)}</div>
    {w.entries.map((e, i) => <div key={i} style={{ padding: '9px 0', borderBottom: '1px solid var(--sep)' }}>
      <div className="small capitalize" style={{ fontWeight: 600 }}>{exName(e.id, S)}{w.prs?.includes(e.id) ? ' · PR' : ''}</div>
      <div className="small muted">{e.sets.filter(s => s.done).map(s => setLabel(e.id, s, e.target)).join('  ·  ') || 'no sets done'}</div>
    </div>)}
  </>
}

function CoachNote({ client, onSaved }) {
  const [note, setNote] = useState(client.note || '')
  const changed = note !== (client.note || '')
  const save = async () => { if (await post('/api/coach/client/update', { id: client.id, note })) { toast('Notes saved'); onSaved() } }
  return <div className="card">
    <h2>Private notes</h2>
    <div className="small dim" style={{ marginBottom: 8 }}>Only you can see these.</div>
    <textarea className="input" rows={4} maxLength={1000} placeholder="Injuries, goals, what to watch for…" value={note} onChange={e => setNote(e.target.value)} />
    {changed && <><div style={{ height: 8 }} /><Button size="sm" variant="primary" onClick={save}>Save notes</Button></>}
  </div>
}

function Report({ r, unit }) {
  const [y, m] = r.month.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const change = r.weightStart != null && r.weightEnd != null ? Math.round((r.weightEnd - r.weightStart) * 10) / 10 : null
  return <div className="card">
    <h2>{label}</h2>
    <dl className="kv">
      <dt>Workouts</dt><dd>{r.workouts}</dd>
      <dt>Days trained</dt><dd>{r.activeDays}</dd>
      <dt>Volume</dt><dd>{fmtNum(r.volume)} {unit}</dd>
      <dt>Personal records</dt><dd>{r.prs}</dd>
      <dt>Body weight</dt><dd>{r.weightStart == null ? '—'
        : change ? `${fmtNum(r.weightStart)} → ${fmtNum(r.weightEnd)} ${unit} (${change > 0 ? '+' : ''}${fmtNum(change)})`
          : `${fmtNum(r.weightEnd)} ${unit}`}</dd>
    </dl>
  </div>
}

function Overview({ d, reload }) {
  const S = d.state, c = d.client
  const bw = points(S.bodyweight, 'w')
  const since = Date.now() - 30 * DAY
  const recent = S.workouts.filter(w => (w.start || Date.parse(w.d)) > since)
  const load = loadOfWorkouts(recent)
  const { worked, missed } = rankOf(load)
  return <>
    <div className="kpis">
      <Kpi icon="dumbbell" label="Workouts · 30 days" value={c.workouts30d} />
      <Kpi icon="target" label="Plan compliance" value={pct(c.assignment?.rate)} sub={c.assignment ? `${c.assignment.done}/${c.assignment.planned} sessions` : 'no active plan'}
        color={c.assignment?.rate != null && c.assignment.rate < 0.5 ? 'var(--orange)' : undefined} />
      <Kpi icon="history" label="Last workout" value={c.lastWorkout ? relDay(c.lastWorkout) : '—'} />
      <Kpi icon="scale" label="Weight · 30 days" value={c.weightChange30d == null ? '—' : (c.weightChange30d > 0 ? '+' : '') + fmtNum(c.weightChange30d) + ' ' + S.unit}
        sub={c.weight != null ? `now ${fmtNum(c.weight)} ${S.unit}` : null} />
    </div>
    <div className="card"><h2>Weight trend</h2>
      {bw.length ? <div className="chart"><LineChart points={bw} h={140} unit={S.unit} goal={S.targetW} /></div> : <div className="muted small">No weigh-ins yet.</div>}
    </div>
    <div className="card"><h2>Consistency</h2><Heatmap S={S} onDay={() => {}} /></div>
    <div className="card"><h2>Muscles trained · 30 days</h2>
      {recent.length ? <>
        <BodyMap load={load} body={S.body} />
        <div className="mchips">{worked.slice(0, 6).map(m => <span key={m} className="mchip">{MUSCLE_NAME[m]}</span>)}</div>
        {missed.length > 0 && <div className="small dim" style={{ marginTop: 8 }}>Not trained: {missed.slice(0, 8).map(m => MUSCLE_NAME[m]).join(', ')}</div>}
      </> : <div className="muted small">No workouts in the last 30 days.</div>}
    </div>
    <CoachNote client={c} onSaved={reload} />
  </>
}

function ProgressTab({ d }) {
  const S = d.state, m = d.metrics
  const openSheet = useUI(s => s.openSheet)
  const bf = points(S.metrics, 'bf'), mm = points(S.metrics, 'mm')
  const lifts = topLifts(S.workouts, 4)
  const photos = sortByDay(S.photos).reverse()
  return <>
    <div className="kpis">
      <Kpi icon="scale" label="Weight" value={m.weight != null ? `${fmtNum(m.weight)} ${m.unit}` : '—'} />
      <Kpi icon="figureStrength" label="BMI" value={m.bmi ?? '—'} sub={m.height ? `height ${m.height} cm` : 'no height set'} />
      <Kpi icon="target" label="Body fat" value={m.bodyFat != null ? fmtNum(m.bodyFat) + '%' : '—'} />
      <Kpi icon="arm" label="Muscle mass" value={m.muscleMass != null ? `${fmtNum(m.muscleMass)} ${m.unit}` : '—'} />
    </div>
    {(bf.length > 0 || mm.length > 0) && <div className="card"><h2>Body composition</h2>
      {bf.length > 0 && <><div className="small muted">Body fat %</div><div className="chart"><LineChart points={bf} h={110} unit="%" /></div></>}
      {mm.length > 0 && <><div className="small muted" style={{ marginTop: 10 }}>Muscle mass</div><div className="chart"><LineChart points={mm} h={110} unit={S.unit} color="var(--teal)" /></div></>}
    </div>}
    <div className="card"><h2>Strength progress</h2>
      {lifts.length ? lifts.map(id => {
        const pts = e1rmSeries(S, id)
        return <div key={id} style={{ marginBottom: 12 }}>
          <div className="small row between"><span className="capitalize">{exName(id, S)}</span>
            <span className="muted money">est. 1RM {pts.length ? fmtNum(pts[pts.length - 1].y) + ' ' + S.unit : '—'}</span></div>
          {pts.length > 1 ? <div className="chart"><LineChart points={pts} h={90} unit={S.unit} /></div>
            : <div className="dim small">Two sessions are needed to show a trend.</div>}
        </div>
      }) : <div className="muted small">No loaded lifts logged yet.</div>}
    </div>
    <div className="card"><h2>Measurements</h2><MeasureTable measure={S.measure} /></div>
    <div className="card"><h2>Progress photos</h2>
      {photos.length ? <div className="gallery">{photos.map(p => <img key={p.id} src={mediaUrl(p.id)} alt={'Progress photo, ' + p.d} loading="lazy"
        onClick={() => openSheet(() => <><h3>{fmtDate(p.d, true)}</h3><img src={mediaUrl(p.id)} alt={'Progress photo, ' + p.d} style={{ width: '100%', borderRadius: 12, display: 'block' }} /></>)} />)}</div>
        : <div className="muted small">No photos yet.</div>}
    </div>
    {d.reports.map(r => <Report key={r.month} r={r} unit={S.unit} />)}
  </>
}

function WorkoutsTab({ d }) {
  const S = d.state
  const openSheet = useUI(s => s.openSheet)
  const list = [...S.workouts].sort((a, b) => (b.start || 0) - (a.start || 0))
  return <div className="list">
    {list.slice(0, 100).map((w, i) => <div key={w.id || i} className="item" onClick={() => openSheet(() => <WorkoutSheet w={w} S={S} />)}>
      <div className="grow"><div className="tt">{w.name}</div>
        <div className="ss">{fmtDate(w.d, true)} · {setsDone(w)} sets · {fmtVol(w.vol ?? workoutVolume(w), S.unit)}{w.prs?.length ? ` · ${w.prs.length} PR` : ''}</div></div>
      <Icon name="chevronRight" className="chev" />
    </div>)}
    {!list.length && <div className="empty"><div className="ico"><Icon name="dumbbell" /></div>No workouts logged yet.</div>}
  </div>
}

function PlansTab({ d, reload }) {
  const remove = a => confirmSheet({
    title: 'Remove this assignment?',
    message: `“${a.planName}” is taken off ${d.client.name}’s plans. Routines they already added stay in their planner.`,
    confirmText: 'Remove', danger: true,
    onConfirm: async () => { if (await post('/api/coach/assignment/delete', { id: a.id })) { toast('Assignment removed'); reload() } }
  })
  return <>
    {d.assignments.map(a => <div key={a.id} className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>{a.planName}</h2>
        <button className="iconbtn" aria-label="Remove assignment" style={{ color: 'var(--red)', width: 32, height: 30, fontSize: 15 }} onClick={() => remove(a)}><Icon name="trash" /></button></div>
      <div className="small muted">{a.category ? a.category + ' · ' : ''}{fmtDate(a.start, true)}{a.end ? ' – ' + fmtDate(a.end, true) : ' onwards'} · {a.addedAt ? 'added to their week' : 'not added yet'}</div>
      {a.rate != null
        ? <div style={{ marginTop: 10 }}>
          <div className="small row between"><span className="muted">Compliance</span><span className="money">{a.done}/{a.planned} · {pct(a.rate)}</span></div>
          <div className="bar" style={{ marginTop: 5 }}><i style={{ width: pct(a.rate), background: a.rate < 0.5 ? 'var(--orange)' : undefined }} /></div>
        </div>
        : <div className="small dim" style={{ marginTop: 8 }}>{a.planned === 0 && a.start <= new Date().toISOString().slice(0, 10) ? 'No sessions scheduled yet.' : 'Starts ' + fmtDate(a.start, true) + '.'}</div>}
      {a.note && <div className="small" style={{ marginTop: 8 }}>{a.note}</div>}
    </div>)}
    {!d.assignments.length && <div className="empty"><div className="ico"><Icon name="clipboard" /></div>No plans assigned yet.</div>}
  </>
}

function BillingTab({ d }) {
  const fees = d.payments.reduce((n, p) => n + p.amount, 0)
  const received = d.payments.reduce((n, p) => n + (p.received || 0), 0)
  return <>
    <div className="kpis">
      <Kpi icon="rupee" label="Platform fees" value={fmtINR(fees)} sub={`${d.payments.length} month${d.payments.length === 1 ? '' : 's'}`} />
      <Kpi icon="checks" label="They paid you" value={fmtINR(received)} sub="as you recorded it" />
    </div>
    <div className="sect-b">
      {d.payments.map(p => <div key={p.id} className="lrow">
        <span className="lrow-m"><span className="lrow-t">{fmtDay(p.periodStart)} – {fmtDay(p.periodEnd)}</span>
          <span className="lrow-s">{p.received ? 'They paid you ' + fmtINR(p.received) : p.note || 'Renewal'}</span></span>
        <span className="lrow-v money">{fmtINR(p.amount)}</span>
        <span className={'pill ' + (p.settled ? 'active' : 'due')}>{p.settled ? 'Paid' : 'Owed'}</span>
      </div>)}
      {!d.payments.length && <div className="lrow"><span className="lrow-s">No renewals recorded.</span></div>}
    </div>
  </>
}

export default function ClientDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const openSheet = useUI(s => s.openSheet)
  const { data, error, reload } = useApi('/api/coach/client?id=' + encodeURIComponent(id))
  const [tab, setTab] = useState('overview')

  const back = <button className="iconbtn" onClick={() => nav('/c/clients')} aria-label="Back"><Icon name="chevronLeft" /></button>
  if (error) return <div className="narrow"><div className="hdr">{back}</div><div className="card small" style={{ color: 'var(--red)' }}>{error}</div></div>
  if (!data) return <div className="narrow"><div className="hdr">{back}</div><div className="muted small">Loading…</div></div>

  const c = data.client
  const toggleLock = () => c.locked
    ? post('/api/coach/client/lock', { id: c.id, locked: false }).then(r => { if (r) { toast('Access restored'); reload() } })
    : confirmSheet({
      title: 'Pause ' + c.name + '?', message: 'They can’t use the app until you unlock them. Their data is kept.',
      confirmText: 'Pause access', danger: true,
      onConfirm: async () => { if (await post('/api/coach/client/lock', { id: c.id, locked: true })) { toast('Access paused'); reload() } }
    })
  const del = () => confirmSheet({
    title: 'Delete ' + c.name + '?',
    message: 'Deletes their account, workouts, measurements and photos. This can’t be undone. Renewals already recorded stay on your billing.',
    confirmText: 'Delete client', danger: true,
    onConfirm: async () => { if (await post('/api/coach/client/delete', { id: c.id })) { toast('Client deleted'); nav('/c/clients') } }
  })

  return <div className="narrow">
    <div className="hdr">
      {back}
      <div style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
        <h1 style={{ fontSize: 28, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</h1>
        <div className="sub">{c.live ? 'Training now · ' + c.live.name : daysText(c.daysLeft)}</div>
      </div>
      <span className={'pill ' + c.access}>{accessLabel(c.access)}</span>
    </div>

    <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      <Button size="sm" variant="primary" icon="reset" onClick={() => openSheet(close => <RenewSheet client={c} fee={data.fee} close={close} onDone={reload} />)}>Renew</Button>
      <Button size="sm" icon="send" onClick={() => assignSheet({ clientId: c.id, onDone: reload })}>Assign plan</Button>
      <Button size="sm" icon="chat" onClick={() => nav('/chat/' + c.id)}>Message</Button>
      <Button size="sm" icon="lock" onClick={toggleLock}>{c.locked ? 'Unpause' : 'Pause'}</Button>
    </div>

    <Segmented className="seg-range" options={TABS} value={tab} onChange={setTab} />
    <div style={{ height: 14 }} />
    {tab === 'overview' && <Overview d={data} reload={reload} />}
    {tab === 'progress' && <ProgressTab d={data} />}
    {tab === 'workouts' && <WorkoutsTab d={data} />}
    {tab === 'plans' && <PlansTab d={data} reload={reload} />}
    {tab === 'payments' && <BillingTab d={data} />}

    <div style={{ height: 22 }} />
    <Button variant="danger" icon="trash" onClick={del}>Delete client</Button>
  </div>
}
