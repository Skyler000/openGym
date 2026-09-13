import { useState } from 'react'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast } from '../../lib/useApi.js'
import { todayISO } from '../../lib/format.js'
import { Button, Check } from '../../components/ui.jsx'

// Assign a plan to one or more clients (or a whole group), with dates and a note. Opened from a plan
// (planId fixed) or from a client (clientId fixed); whichever is fixed isn't asked for.
function AssignSheet({ planId, clientId, close, onDone }) {
  const plans = useApi(planId ? null : '/api/coach/plans')
  const clients = useApi(clientId ? null : '/api/coach/clients')
  const groups = useApi(clientId ? null : '/api/coach/groups')
  const [pid, setPid] = useState(planId || '')
  const [picked, setPicked] = useState(clientId ? [clientId] : [])
  const [groupId, setGroupId] = useState('')
  const [start, setStart] = useState(todayISO())
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')

  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  const go = async () => {
    if (!pid) { toast('Pick a plan'); return }
    if (!picked.length && !groupId) { toast('Pick at least one client'); return }
    const r = await post('/api/coach/assign', { planId: pid, clientIds: picked, groupId: groupId || undefined, start, end: end || undefined, note })
    if (r) { toast(`Assigned to ${r.count} client${r.count === 1 ? '' : 's'}`); if (onDone) onDone(); close() }
  }

  // The row owns the click; the checkbox is display only, or one tap would toggle twice.
  const Pick = ({ on, title, sub, onClick }) => <div className="item" onClick={onClick}>
    <div className="grow"><div className="tt">{title}</div>{sub && <div className="ss">{sub}</div>}</div>
    <Check checked={on} onChange={() => {}} />
  </div>

  return <>
    <h3>Assign a plan</h3>
    {!planId && <>
      <h4 className="sec">Plan</h4>
      <div className="list">
        {(plans.data?.plans || []).map(p => <Pick key={p.id} on={pid === p.id} title={p.name}
          sub={`${p.category} · ${p.bundle.routines.length} routine${p.bundle.routines.length === 1 ? '' : 's'}`} onClick={() => setPid(p.id)} />)}
        {plans.data && !plans.data.plans.length && <div className="empty small">No plans yet — build one in Plans first.</div>}
      </div>
    </>}
    {!clientId && <>
      <h4 className="sec">Clients</h4>
      {groups.data?.groups?.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>
        {groups.data.groups.map(g => <button key={g.id} className={'chip nocap' + (groupId === g.id ? ' on' : '')}
          onClick={() => setGroupId(groupId === g.id ? '' : g.id)}>{g.name} ({g.clientIds.length})</button>)}
      </div>}
      <div className="list">
        {(clients.data?.clients || []).filter(c => c.access === 'active').map(c =>
          <Pick key={c.id} on={picked.includes(c.id)} title={c.name} onClick={() => toggle(c.id)} />)}
        {clients.data && !clients.data.clients.some(c => c.access === 'active') && <div className="empty small">No active clients to assign to.</div>}
      </div>
    </>}
    <h4 className="sec">Dates</h4>
    <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
      <label className="grow small muted">Starts<input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label className="grow small muted">Ends (optional)<input type="date" className="input" value={end} min={start} onChange={e => setEnd(e.target.value)} /></label>
    </div>
    <div style={{ height: 10 }} />
    <textarea className="input" rows={3} maxLength={500} placeholder="A note for the client (optional)" value={note} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="send" onClick={go}>Assign</Button>
  </>
}

export const assignSheet = opts => useUI.getState().openSheet(close => <AssignSheet {...opts} close={close} />)
