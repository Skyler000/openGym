import { useNavigate } from 'react-router-dom'
import { useApi, post, toast } from '../../lib/useApi.js'
import { accessLabel, fmtINR, fmtDay, COACH_REMIND_DAYS, CLIENT_REMIND_DAYS } from '../../lib/roles.js'
import { monthLabel, shortINR } from '../../lib/feed.js'
import Icon from '../../components/Icon.jsx'
import Kpi from '../../components/Kpi.jsx'
import Bell from '../../components/Bell.jsx'
import BarChart from '../../components/BarChart.jsx'
import { Button, Row } from '../../components/ui.jsx'

// Super admin home: what the platform has collected, what coaches still owe for their clients, who is
// due to renew, and each coach's numbers. English-only operator screen.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function Dashboard() {
  const nav = useNavigate()
  const { data: d, error, reload } = useApi('/api/sa/dashboard')

  const runReminders = async () => {
    const r = await post('/api/sa/reminders/run', {})
    if (!r) return
    toast(r.sent ? `Sent ${plural(r.sent, 'notification')}` : 'Nothing is due right now')
    reload()
  }

  return <div className="narrow">
    <div className="hdr">
      <div><h1>Dashboard</h1><div className="sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <Bell />
    </div>
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}

    {d && <>
      <h4 className="sec">Revenue</h4>
      <div className="kpis">
        <Kpi icon="rupee" label="This month" value={fmtINR(d.revenue.month)} />
        <Kpi icon="calendar" label="This year" value={fmtINR(d.revenue.year)} />
        <Kpi icon="chart" label="All time" value={fmtINR(d.revenue.total)} />
        <Kpi icon="clock" label="Owed by coaches" value={fmtINR(d.outstanding)} sub="client renewals not paid over"
          color={d.outstanding ? 'var(--orange)' : undefined} />
      </div>
      <div className="card">
        <h2>Collected per month</h2>
        <BarChart rows={d.series.map(m => ({ label: monthLabel(m.month), revenue: m.revenue }))}
          series={[{ key: 'revenue', label: 'Collected', color: 'var(--acc)' }]} fmt={fmtINR} short={shortINR} />
        <div className="dim small" style={{ marginTop: 8 }}>Annual fees count when recorded; client renewals count when a coach’s dues are settled.</div>
      </div>

      <h4 className="sec">Accounts</h4>
      <div className="kpis">
        <Kpi icon="users" label="Active coaches" value={d.coaches.active} sub={`of ${d.coaches.total}`} />
        <Kpi icon="lock" label="Expired coaches" value={d.coaches.expired} color={d.coaches.expired ? 'var(--orange)' : undefined}
          sub={d.coaches.blocked ? `${d.coaches.blocked} locked or suspended` : undefined} />
        <Kpi icon="person" label="Active clients" value={d.clients.active} sub={`of ${d.clients.total}`} />
        <Kpi icon="lock" label="Expired clients" value={d.clients.expired} color={d.clients.expired ? 'var(--orange)' : undefined}
          sub={d.clients.paused ? `${d.clients.paused} paused` : undefined} />
      </div>

      <h4 className="sec">Pending renewals</h4>
      <div className="list">
        {d.pendingRenewals.map(c => <div key={c.id} className="item" onClick={() => nav('/sa/coach/' + c.id)}>
          <span className="lrow-i" style={{ background: c.access === 'expired' ? 'var(--orange)' : 'var(--yellow)' }}><Icon name="calendar" /></span>
          <div className="grow">
            <div className="tt">{c.name}</div>
            <div className="ss">{c.paidUntil ? `${c.access === 'expired' ? 'ended' : 'ends'} ${fmtDay(c.paidUntil)}` : 'never paid'} · {plural(c.clients, 'client')}</div>
          </div>
          <span className={'pill ' + (c.access === 'active' ? 'due' : c.access)}>
            {c.access === 'active' ? (c.daysLeft === 0 ? 'today' : `${c.daysLeft}d left`) : accessLabel(c.access)}
          </span>
          <Icon name="chevronRight" className="chev" />
        </div>)}
        {!d.pendingRenewals.length && <div className="empty small">No coach subscriptions end in the next {COACH_REMIND_DAYS} days.</div>}
      </div>

      <h4 className="sec">Coach-wise</h4>
      <div className="list">
        {d.coachStats.map(c => <div key={c.id} className="item" onClick={() => nav('/sa/coach/' + c.id)}>
          <span className="lrow-i" style={{ background: 'var(--indigo)' }}><Icon name="personCircle" /></span>
          <div className="grow">
            <div className="tt">{c.name}</div>
            <div className="ss">
              {c.clients.active}/{c.clients.total} clients active · {plural(c.billing.renewalsThisMonth, 'renewal')} this month
              · paid {fmtINR(c.billing.paidToPlatformYear)} this year{c.billing.owed ? ` · owes ${fmtINR(c.billing.owed)}` : ''}
            </div>
          </div>
          <span className={'pill ' + c.access}>{accessLabel(c.access)}</span>
          <Icon name="chevronRight" className="chev" />
        </div>)}
        {!d.coachStats.length && <div className="empty"><div className="ico"><Icon name="users" /></div>
          No coaches yet.<div style={{ height: 10 }} /><Button size="sm" icon="personAdd" onClick={() => nav('/sa/coaches')}>Invite a coach</Button></div>}
      </div>

      <h4 className="sec">Recent payments</h4>
      <div className="sect-b">
        {d.recentPayments.map((p, i) => <div key={i} className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">{p.coachName}</span>
            <span className="lrow-s">{p.kind === 'annual' ? 'Annual subscription' : `Settled ${plural(p.count, 'client renewal')}`} · {fmtDay(p.at)}</span>
          </span>
          <span className="money" style={{ fontWeight: 600 }}>{fmtINR(p.amount)}</span>
        </div>)}
        {!d.recentPayments.length && <div className="lrow"><span className="lrow-s">No payments recorded yet.</span></div>}
      </div>

      <h4 className="sec">Reminders</h4>
      <div className="sect-b">
        <Row icon="bell" iconTint="var(--orange)" title="Send due reminders now" accessory="chevron" onClick={runReminders}
          subtitle={`Runs every 10 minutes by itself: coaches ${COACH_REMIND_DAYS} days before they expire, clients ${CLIENT_REMIND_DAYS} days before (to their coach), expiry notices, and weekly progress check-ins.`} />
      </div>
    </>}
  </div>
}
