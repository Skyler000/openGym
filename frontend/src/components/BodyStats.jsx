// Body measurements, shared by the client's Progress screen and the coach's view of a client.
import { fmtDate, fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'

export const MEASURE_FIELDS = [['chest', 'Chest'], ['waist', 'Waist'], ['hips', 'Hips'], ['arm', 'Arm'], ['thigh', 'Thigh']]

const LB = 0.45359237
const byDay = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)
export const sortByDay = list => [...(list || [])].sort(byDay)

// Same rule as api/lib/stats.js: the app's units are labels, so a lb profile's weights are pounds.
export function bmiOf(weight, heightCm, unit = 'kg') {
  const kg = unit === 'lb' ? weight * LB : weight
  return kg > 0 && heightCm > 0 ? Math.round((kg / (heightCm / 100) ** 2) * 10) / 10 : null
}

const signed = n => (n > 0 ? '+' : '') + fmtNum(n)

// The first measurement against the latest, so the change over the whole period reads in one column.
export function MeasureTable({ measure }) {
  const list = sortByDay(measure)
  if (!list.length) return <div className="muted small">{t('No measurements logged yet.')}</div>
  const first = list[0], last = list[list.length - 1], span = first !== last
  const cell = { textAlign: 'right', padding: '7px 0 7px 12px', fontWeight: 400 }
  return <div style={{ overflowX: 'auto' }}>
    <table className="small money" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr className="muted">
        <th style={{ textAlign: 'left', fontWeight: 400 }}>cm</th>
        {span && <th style={cell}>{fmtDate(first.d)}</th>}
        <th style={cell}>{fmtDate(last.d)}</th>
        {span && <th style={cell}>{t('Change')}</th>}
      </tr></thead>
      <tbody>{MEASURE_FIELDS.filter(([k]) => last[k] != null).map(([k, label]) => (
        <tr key={k} style={{ borderTop: '1px solid var(--sep)' }}>
          <td style={{ padding: '7px 0' }}>{t(label)}</td>
          {span && <td style={cell}>{first[k] != null ? fmtNum(first[k]) : '—'}</td>}
          <td style={cell}>{fmtNum(last[k])}</td>
          {span && <td style={cell}>{first[k] != null ? signed(last[k] - first[k]) : '—'}</td>}
        </tr>
      ))}</tbody>
    </table>
  </div>
}
