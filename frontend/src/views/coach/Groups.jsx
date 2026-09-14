import { useState } from 'react'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast } from '../../lib/useApi.js'
import { confirmSheet } from '../../sheets.jsx'
import { assignSheet } from './assign.jsx'
import Icon from '../../components/Icon.jsx'
import { Button, Check } from '../../components/ui.jsx'

// Client groups: a named set of clients to assign a plan to in one go ("Morning batch", "Fat loss
// February"). A client can belong to any number of groups. English-only.

function GroupSheet({ group, clients, close, onDone }) {
  const [name, setName] = useState(group?.name || '')
  const [picked, setPicked] = useState(group?.clientIds || [])
  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  const save = async () => {
    if (!name.trim()) { toast('Give the group a name'); return }
    const r = await post('/api/coach/groups/save', { id: group?.id, name, clientIds: picked })
    if (r) { toast(group ? 'Group saved' : 'Group created'); onDone(); close() }
  }
  const remove = () => confirmSheet({
    title: `Delete “${group.name}”?`,
    message: 'The clients stay; only the group goes. Plans already assigned through it are kept.',
    confirmText: 'Delete group', danger: true,
    onConfirm: async () => { if (await post('/api/coach/groups/delete', { id: group.id })) { toast('Group deleted'); onDone() } }
  })

  return <>
    <h3>{group ? 'Edit group' : 'New group'}</h3>
    <input className="input" placeholder="Group name" aria-label="Group name" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
    <h4 className="sec">Clients · {picked.length}</h4>
    <div className="list">
      {/* The row owns the click; the checkbox only shows the state. */}
      {clients.map(c => <div key={c.id} className="item" onClick={() => toggle(c.id)}>
        <div className="grow"><div className="tt">{c.name}</div></div>
        <Check checked={picked.includes(c.id)} onChange={() => {}} />
      </div>)}
      {!clients.length && <div className="empty small">No clients yet.</div>}
    </div>
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="check" onClick={save}>{group ? 'Save group' : 'Create group'}</Button>
    {group && <><div style={{ height: 8 }} /><Button variant="danger" icon="trash" onClick={remove}>Delete group</Button></>}
  </>
}

export function GroupsSection({ clients }) {
  const openSheet = useUI(s => s.openSheet)
  const { data, reload } = useApi('/api/coach/groups')
  const groups = data?.groups || []
  const nameOf = id => clients.find(c => c.id === id)?.name
  const edit = group => openSheet(close => <GroupSheet group={group} clients={clients} close={close} onDone={reload} />)

  return <>
    <div className="row between" style={{ margin: '22px 2px 8px' }}>
      <h4 className="sec" style={{ margin: 0 }}>Groups</h4>
      <Button size="sm" icon="plus" onClick={() => edit(null)}>New group</Button>
    </div>
    <div className="list">
      {groups.map(g => <div key={g.id} className="item" onClick={() => edit(g)}>
        <span className="lrow-i" style={{ background: 'var(--teal)' }}><Icon name="users" /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="tt">{g.name}</div>
          <div className="ss ellipsis">{g.clientIds.length ? g.clientIds.map(nameOf).filter(Boolean).join(', ') : 'No clients'}</div>
        </div>
        <Button size="sm" disabled={!g.clientIds.length} onClick={e => { e.stopPropagation(); assignSheet({ groupId: g.id }) }}>Assign plan</Button>
      </div>)}
      {data && !groups.length && <div className="empty small">Group clients to assign one plan to all of them at once.</div>}
    </div>
  </>
}
