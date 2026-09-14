import { useNavigate } from 'react-router-dom'
import { useApi } from '../../lib/useApi.js'
import { accessLabel, fmtINR, pct } from '../../lib/roles.js'
import { monthLabel } from '../../lib/feed.js'
import Icon from '../../components/Icon.jsx'
import Kpi from '../../components/Kpi.jsx'
import BarChart from '../../components/BarChart.jsx'

// Platform analytics for the super admin: a year of revenue, how many coaches and clients join each
// month, churn and retention, and every coach side by side. English-only operator screen.

const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] || 0), 0)

export default function Analytics() {
  const nav = useNavigate()
  const { data: d, error } = useApi('/api/sa/analytics')
  const best = d ? d.revenue.reduce((b, r) => (r.revenue > (b?.revenue || 0) ? r : b), null) : null
  const churnSub = c => `${c.lapsed} lapsed of ${c.active + c.lapsed} paid up`

  return <div className="narrow">
    <div className="hdr"><div><h1>Analytics</h1><div className="sub">The last 12 months</div></div></div>
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}

    {d && <>
      <h4 className="sec">Revenue</h4>
      <div className="kpis">
        <Kpi icon="rupee" label="Collected · 12 months" value={fmtINR(sum(d.revenue, 'revenue'))} />
        <Kpi icon="chart" label="Best month" value={best ? fmtINR(best.revenue) : '—'} sub={best ? monthLabel(best.month) : 'nothing collected yet'} />
      </div>
      <div className="card">
        <h2>Collected per month</h2>
        <BarChart rows={d.revenue.map(r => ({ label: monthLabel(r.month), revenue: r.revenue }))} labelEvery={2}
          series={[{ key: 'revenue', label: 'Collected', color: 'var(--acc)' }]} fmt={fmtINR} />
      </div>

      <h4 className="sec">User growth</h4>
      <div className="kpis">
        <Kpi icon="users" label="New coaches" value={sum(d.growth, 'coaches')} sub={`last 12 months · ${d.totals.coaches} in total`} />
        <Kpi icon="person" label="New clients" value={sum(d.growth, 'clients')} sub={`last 12 months · ${d.totals.clients} in total`} />
      </div>
      <div className="card">
        <h2>Sign-ups per month</h2>
        <BarChart rows={d.growth.map(g => ({ label: monthLabel(g.month), coaches: g.coaches, clients: g.clients }))} labelEvery={2}
          series={[{ key: 'coaches', label: 'Coaches', color: 'var(--indigo)' }, { key: 'clients', label: 'Clients', color: 'var(--acc)' }]} />
      </div>

      <h4 className="sec">Churn and retention</h4>
      <div className="kpis">
        <Kpi icon="users" label="Coach churn" value={pct(d.churn.coaches.rate)} sub={churnSub(d.churn.coaches)}
          color={d.churn.coaches.rate > 0 ? 'var(--orange)' : undefined} />
        <Kpi icon="person" label="Client churn" value={pct(d.churn.clients.rate)} sub={churnSub(d.churn.clients)}
          color={d.churn.clients.rate > 0 ? 'var(--orange)' : undefined} />
        <Kpi icon="reset" label="Client retention" value={pct(d.totals.retention)} sub="renewed at least once" />
        <Kpi icon="checkCircle" label="Clients paid up" value={d.churn.clients.active} sub={`of ${d.totals.clients}`} />
      </div>
      <div className="dim small" style={{ margin: '-2px 4px 12px' }}>
        Churn counts accounts whose term ran out, out of those that were paid up. Accounts someone locked or suspended are left out.
      </div>

      <h4 className="sec">Coach performance</h4>
      <div className="list">
        {d.performance.map(c => <div key={c.id} className="item" onClick={() => nav('/sa/coach/' + c.id)}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="tt">{c.name}</div>
            <div className="ss">{c.activeClients}/{c.clients} clients active · retention {pct(c.retention)} · compliance {pct(c.avgCompliance)}</div>
            <div className="ss">{c.renewals12m} renewal{c.renewals12m === 1 ? '' : 's'} · paid {fmtINR(c.paid12m)} · {c.workouts30d} client workouts in 30 days</div>
          </div>
          <span className={'pill ' + c.access}>{accessLabel(c.access)}</span>
          <Icon name="chevronRight" className="chev" />
        </div>)}
        {!d.performance.length && <div className="empty small">No coaches yet.</div>}
      </div>
    </>}
  </div>
}
