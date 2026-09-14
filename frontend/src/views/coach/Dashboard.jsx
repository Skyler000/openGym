import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { useApi } from '../../lib/useApi.js'
import { accessLabel, dueSoon, pct, fmtINR, fmtDay, COACH_REMIND_DAYS, CLIENT_REMIND_DAYS } from '../../lib/roles.js'
import { monthLabel, activityText } from '../../lib/feed.js'
import { RenewSheet } from './ClientDetail.jsx'
import { relDay } from './Clients.jsx'
import Icon from '../../components/Icon.jsx'
import Kpi from '../../components/Kpi.jsx'
import Bell from '../../components/Bell.jsx'
import BarChart from '../../components/BarChart.jsx'
import { Button } from '../../components/ui.jsx'

// Coach home: clients at a glance, this month's money, who needs renewing, how the roster is
// training, and what clients have logged lately. English-only, like the other coach screens.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const signed = (n, unit) => `${n > 0 ? '+' : ''}${n} ${unit}`

export default function Dashboard() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  const { data: d, error, reload } = useApi('/api/coach/dashboard')

  const renew = c => openSheet(close => <RenewSheet client={c} fee={d.fee} close={close} onDone={reload} />)

  return <div className="narrow">
    <div className="hdr">
      <div><h1>Dashboard</h1><div className="sub">{user?.name}</div></div>
      <div className="row" style={{ gap: 8 }}>
        <button className="iconbtn" onClick={() => nav('/c/analytics')} aria-label="Analytics"><Icon name="chartLine" /></button>
        <Bell />
      </div>
    </div>

    {dueSoon(user?.daysLeft, COACH_REMIND_DAYS) && <div className="card row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <Icon name="calendar" style={{ color: 'var(--yellow)', fontSize: 20, flex: 'none', marginTop: 1 }} />
      <div className="small">
        Your coach subscription ends {user.daysLeft === 0 ? 'today' : `in ${plural(user.daysLeft, 'day')}`} ({fmtDay(user.paidUntil)}).
        Contact the platform administrator to renew — your clients lose access when it lapses.
      </div>
    </div>}
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}

    {d && <>
      <h4 className="sec">Clients</h4>
      <div className="kpis">
        <Kpi icon="users" label="Active clients" value={d.counts.active} sub={`of ${d.counts.total}`} />
        <Kpi icon="lock" label="Expired clients" value={d.counts.expired} color={d.counts.expired ? 'var(--orange)' : undefined}
          sub={d.counts.paused ? `${d.counts.paused} paused` : undefined} />
        <Kpi icon="calendar" label={`Renewal due · ${CLIENT_REMIND_DAYS}d`} value={d.counts.due} color={d.counts.due ? 'var(--yellow)' : undefined} />
        <Kpi icon="flame" label="Training now" value={d.counts.live} color={d.counts.live ? 'var(--acc)' : undefined} />
      </div>

      <h4 className="sec">This month</h4>
      <div className="kpis">
        <Kpi icon="arrowDown" label="Client payments" value={fmtINR(d.billing.receivedThisMonth)} sub={plural(d.billing.renewalsThisMonth, 'renewal')} />
        <Kpi icon="arrowUp" label="Platform fees" value={fmtINR(d.billing.feesThisMonth)} />
        <Kpi icon="chart" label="Net earnings" value={fmtINR(d.billing.netThisMonth)} color={d.billing.netThisMonth < 0 ? 'var(--red)' : undefined} />
        <Kpi icon="clock" label="Owed to platform" value={fmtINR(d.billing.owed)} sub="until the administrator settles it"
          color={d.billing.owed ? 'var(--orange)' : undefined} />
      </div>
      <div className="card">
        <h2>Earnings, last 6 months</h2>
        <BarChart rows={d.earnings.map(m => ({ label: monthLabel(m.month), received: m.received, fees: m.fees }))} fmt={fmtINR}
          series={[{ key: 'received', label: 'Client payments', color: 'var(--acc)' }, { key: 'fees', label: 'Platform fees', color: 'var(--orange)' }]} />
        <div className="dim small" style={{ marginTop: 8 }}>Client payments are the amounts you enter when renewing a client.</div>
      </div>

      <h4 className="sec">Renewal due</h4>
      <div className="list">
        {d.renewalsDue.map(c => <div key={c.id} className="item" onClick={() => nav('/c/client/' + c.id)}>
          <div className="grow">
            <div className="tt">{c.name}</div>
            <div className="ss">{c.paidUntil ? `${c.access === 'expired' ? 'ended' : 'ends'} ${fmtDay(c.paidUntil)}` : 'never renewed'}</div>
          </div>
          <span className={'pill ' + (c.access === 'active' ? 'due' : c.access)}>
            {c.access === 'active' ? (c.daysLeft === 0 ? 'today' : `${c.daysLeft}d left`) : accessLabel(c.access)}
          </span>
          <Button size="sm" variant="primary" onClick={e => { e.stopPropagation(); renew(c) }}>Renew</Button>
        </div>)}
        {!d.renewalsDue.length && <div className="empty small">No client renewals due in the next {CLIENT_REMIND_DAYS} days.</div>}
      </div>

      <h4 className="sec">Client progress</h4>
      <div className="kpis">
        <Kpi icon="dumbbell" label="Workouts · 30 days" value={d.progress.workouts30d} />
        <Kpi icon="flame" label="Trained this week" value={`${d.progress.trainedLast7d}/${d.progress.activeClients}`} sub="active clients, last 7 days" />
        <Kpi icon="target" label="Plan compliance" value={pct(d.progress.avgCompliance)}
          sub={d.progress.rated ? `average of ${plural(d.progress.rated, 'client')}` : d.progress.onPlan ? 'no sessions due yet' : 'no one on a plan yet'} />
        <Kpi icon="clipboard" label="On a plan" value={`${d.progress.onPlan}/${d.progress.activeClients}`} />
      </div>

      <h4 className="sec">Client-wise</h4>
      <div className="list">
        {d.clientStats.map(c => <div key={c.id} className="item" onClick={() => nav('/c/client/' + c.id)}>
          <div className="grow">
            <div className="tt">{c.name}</div>
            <div className="ss">{[
              `${plural(c.workouts30d, 'workout')} in 30d`,
              c.rate != null ? `${pct(c.rate)} on plan` : null,
              c.weightChange30d ? signed(c.weightChange30d, c.unit) : null,
              c.lastWorkout ? 'last ' + relDay(c.lastWorkout) : 'no workouts yet'
            ].filter(Boolean).join(' · ')}</div>
          </div>
          <span className={'pill ' + c.access}>{c.live ? 'Training' : accessLabel(c.access)}</span>
          <Icon name="chevronRight" className="chev" />
        </div>)}
        {!d.clientStats.length && <div className="empty"><div className="ico"><Icon name="users" /></div>
          No clients yet.<div style={{ height: 10 }} /><Button size="sm" icon="personAdd" onClick={() => nav('/c/clients')}>Invite a client</Button></div>}
      </div>

      <h4 className="sec">Client payments</h4>
      <div className="sect-b">
        {d.payments.map(p => <div key={p.id} className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">{p.clientName}</span>
            <span className="lrow-s">{fmtDay(p.created)} · fee {fmtINR(p.amount)} {p.settled ? 'settled' : 'owed'}</span>
          </span>
          <span className="money" style={{ fontWeight: 600 }}>{p.received != null ? fmtINR(p.received) : '—'}</span>
        </div>)}
        {!d.payments.length && <div className="lrow"><span className="lrow-s">No renewals yet.</span></div>}
      </div>

      <h4 className="sec">Recent activity</h4>
      <div className="sect-b">
        {d.activity.map((a, i) => {
          const x = activityText(a)
          return <div key={i} className="note link" onClick={() => nav('/c/client/' + a.clientId)}>
            <span className="lrow-i" style={{ background: x.tint }}><Icon name={x.icon} /></span>
            <div className="grow">
              <div className="tt">{x.text}</div>
              {x.detail && <div className="bd">{x.detail}</div>}
              <div className="tm">{relDay(a.d)}</div>
            </div>
          </div>
        })}
        {!d.activity.length && <div className="lrow"><span className="lrow-s">Nothing logged by your clients yet.</span></div>}
      </div>
    </>}
  </div>
}
