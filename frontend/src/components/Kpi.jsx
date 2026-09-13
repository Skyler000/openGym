import Icon from './Icon.jsx'

// A labelled number tile. `color` tints the value when it needs attention.
export default function Kpi({ icon, label, value, sub, color }) {
  return <div className="kpi">
    <div className="l">{icon && <Icon name={icon} />}{label}</div>
    <div className="v money" style={color ? { color } : undefined}>{value}</div>
    {sub && <div className="s">{sub}</div>}
  </div>
}
