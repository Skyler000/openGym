import { useNavigate } from 'react-router-dom'
import { useApi } from '../../lib/useApi.js'
import { accessLabel, pct } from '../../lib/roles.js'
import { fmtNum } from '../../lib/format.js'
import Icon from '../../components/Icon.jsx'
import Kpi from '../../components/Kpi.jsx'
import BarChart from '../../components/BarChart.jsx'

// A coach's analytics: how the roster trains week by week, how well clients keep to their plans,
// retention, and each client's month against the one before. English-only.

const weekLabel = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthName = key => new Date(key + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const change = (now, before) => (now === before ? '' : ` (${now > before ? '+' : ''}${now - before})`)

function Report({ c, prevLabel, onOpen }) {
  const m = c.thisMonth, p = c.lastMonth
  const moved = m.weightStart != null && m.weightEnd != null ? Math.round((m.weightEnd - m.weightStart) * 10) / 10 : null
  const weight = m.weightEnd == null ? '—' : moved ? `${fmtNum(m.weightEnd)} ${c.unit} (${moved > 0 ? '+' : ''}${fmtNum(moved)})` : `${fmtNum(m.weightEnd)} ${c.unit}`
  return <div className="card tappable" style={{ cursor: 'pointer' }} onClick={onOpen}>
    <div className="row between" style={{ gap: 8 }}>
      <h2 style={{ margin: 0 }}>{c.name}</h2>
      <span className={'pill ' + c.access}>{accessLabel(c.access)}</span>
    </div>
    <dl className="kv" style={{ marginTop: 10 }}>
      <dt>Workouts</dt><dd>{m.workouts}<span className="dim">{change(m.workouts, p.workouts)}</span></dd>
      <dt>Days trained</dt><dd>{m.activeDays}<span className="dim">{change(m.activeDays, p.activeDays)}</span></dd>
      <dt>Volume</dt><dd>{fmtNum(m.volume)} {c.unit}</dd>
      <dt>Personal records</dt><dd>{m.prs}</dd>
      <dt>Body weight</dt><dd>{weight}</dd>
    </dl>
    <div className="dim small" style={{ marginTop: 6 }}>Changes in brackets are against {prevLabel}.</div>
  </div>
}

export default function Analytics() {
  const nav = useNavigate()
  const { data: d, error } = useApi('/api/coach/analytics')
  const weeks = d?.weekly || []
  const onPlan = (d?.clients || []).filter(c => c.onPlan)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/c')} aria-label="Back"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>Analytics</h1><div className="sub">Your clients</div></div>
    </div>
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}

    {d && <>
      <h4 className="sec">Client activity</h4>
      <div className="kpis">
        <Kpi icon="dumbbell" label="Workouts · 12 weeks" value={weeks.reduce((n, w) => n + w.workouts, 0)} />
        <Kpi icon="flame" label="Trained this week" value={`${d.progress.trainedLast7d}/${d.progress.activeClients}`} sub="active clients, last 7 days" />
      </div>
      <div className="card">
        <h2>Workouts per week</h2>
        <BarChart rows={weeks.map(w => ({ label: weekLabel(w.week), workouts: w.workouts }))} labelEvery={3}
          series={[{ key: 'workouts', label: 'Workouts', color: 'var(--acc)' }]} fmt={String} />
      </div>
      <div className="card">
        <h2>Clients training each week</h2>
        <BarChart rows={weeks.map(w => ({ label: weekLabel(w.week), clients: w.activeClients }))} labelEvery={3}
          series={[{ key: 'clients', label: 'Clients', color: 'var(--teal)' }]} fmt={String} />
      </div>

      <h4 className="sec">Workout completion</h4>
      <div className="kpis">
        <Kpi icon="target" label="Plan compliance" value={pct(d.progress.avgCompliance)}
          sub={d.progress.rated ? `average of ${d.progress.rated}` : d.progress.onPlan ? 'no sessions due yet' : 'no one on a plan yet'} />
        <Kpi icon="clipboard" label="On a plan" value={`${d.progress.onPlan}/${d.progress.activeClients}`} />
      </div>
      {onPlan.length > 0 && <div className="card">
        {onPlan.map(c => <div key={c.id} style={{ padding: '7px 0' }}>
          <div className="small row between" style={{ gap: 8 }}>
            <span className="ellipsis"><b>{c.name}</b> <span className="muted">· {c.planName}</span></span>
            <span className="money muted" style={{ flex: 'none' }}>{c.rate == null ? 'nothing due yet' : `${c.done}/${c.planned} · ${pct(c.rate)}`}</span>
          </div>
          <div className="bar" style={{ marginTop: 5 }}><i style={{ width: pct(c.rate ?? 0) }} /></div>
        </div>)}
      </div>}

      <h4 className="sec">Retention</h4>
      <div className="kpis">
        <Kpi icon="reset" label="Retention" value={pct(d.retention)} sub="clients renewed at least once" />
        <Kpi icon="users" label="Churn" value={pct(d.churn.rate)} sub={`${d.churn.lapsed} lapsed of ${d.churn.active + d.churn.lapsed} paid up`}
          color={d.churn.rate > 0 ? 'var(--orange)' : undefined} />
      </div>

      <h4 className="sec">Progress reports · {monthName(d.month)}</h4>
      {d.clients.map(c => <Report key={c.id} c={c} prevLabel={monthName(d.prevMonth)} onOpen={() => nav('/c/client/' + c.id)} />)}
      {!d.clients.length && <div className="empty small">No clients yet.</div>}
    </>}
  </div>
}
