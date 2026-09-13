// Grouped columns for a handful of periods: months of revenue, or received money against fees.
//   rows    [{ label, [series.key]: number }], oldest first
//   series  [{ key, label, color }]
//   fmt     number -> text, for the accessible summary
//   short   number -> compact text; when given (single series), each column prints its value
export default function BarChart({ rows, series, fmt = String, short, h = 130 }) {
  const max = Math.max(0, ...rows.flatMap(r => series.map(s => r[s.key] || 0)))
  const valued = !!short && series.length === 1
  const height = v => (max && v ? Math.max(2, v / max * 100) + '%' : '0')
  const summary = rows.map(r => r.label + ': ' + series.map(s => `${s.label} ${fmt(r[s.key] || 0)}`).join(', ')).join('; ')
  return <div className="barchart">
    {series.length > 1 && <div className="legend">
      {series.map(s => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
    </div>}
    <div className={'bars' + (valued ? ' valued' : '')} style={{ height: h }} role="img" aria-label={summary}>
      {rows.map(r => <div key={r.label} className="col">
        <div className="stack">
          {series.map(s => <i key={s.key} style={{ height: height(r[s.key]), background: s.color }}>
            {valued && r[s.key] > 0 && <b>{short(r[s.key])}</b>}
          </i>)}
        </div>
        <span>{r.label}</span>
      </div>)}
    </div>
  </div>
}
