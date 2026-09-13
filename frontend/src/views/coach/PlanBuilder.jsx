import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { api } from '../../lib/api.js'
import { post, toast } from '../../lib/useApi.js'
import { uid, DAYN } from '../../lib/format.js'
import { exOr } from '../../lib/exercises.js'
import { exLine } from '../../lib/history.js'
import { glyphOf, DEFAULT_GLYPH } from '../../lib/glyphs.js'
import { POLICIES_FOR, POLICY_NAME } from '../../lib/progression.js'
import { exercisePicker, exConfigSheet, glyphPicker, confirmSheet } from '../../sheets.jsx'
import { assignSheet } from './assign.jsx'
import Icon from '../../components/Icon.jsx'
import { Thumb } from '../../components/Media.jsx'
import { Button, SelectRow, Stepper } from '../../components/ui.jsx'

// Build a plan for clients. The plan is kept as a local draft and saved to the server in one go;
// nothing here touches the coach's own routines. The exercise picker and the sets/reps sheet are the
// same ones the app uses everywhere — they report back through callbacks rather than writing state.

const CATEGORIES = ['Strength Training', 'Muscle Building', 'Fat Loss', 'Cardio', 'HIIT', 'Flexibility', 'Custom']
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const clone = o => JSON.parse(JSON.stringify(o))
const blankPlan = () => ({
  id: null, name: 'New plan', category: 'Custom', notes: '',
  bundle: { routines: [{ id: uid(), name: 'Day 1', emoji: DEFAULT_GLYPH, ex: [] }], week: {}, customEx: [] }
})

// Rest and a coaching cue, per exercise. Sets, reps and progression stay in the shared sheet; these two
// are the coach's additions, and they travel with the plan to the client's workout screen.
function ExtrasSheet({ name, cfg, unit, close, onSave, onEdit, onRemove }) {
  const [rest, setRest] = useState(cfg.rest || 0)
  const [note, setNote] = useState(cfg.note || '')
  return <>
    <h3 className="capitalize">{name}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{exLine(cfg, unit)}</div>
    <Button icon="pencil" onClick={() => { close(); onEdit() }}>Sets, reps & progression</Button>
    <h4 className="sec">Rest after each set</h4>
    <div className="row cfgrow" style={{ marginBottom: 4 }}>
      <Stepper label="Seconds (0 uses the client’s default)" value={rest} step={15} decimal={false} onChange={setRest} />
    </div>
    <h4 className="sec">Coaching cue</h4>
    <textarea className="input" rows={3} maxLength={500} placeholder="e.g. Pause a second at the bottom, elbows tucked" value={note} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={() => { onSave({ rest: rest > 0 ? rest : 0, note: note.trim() }); close() }}>Save</Button>
    <div style={{ height: 8 }} />
    <Button variant="danger" onClick={() => { close(); onRemove() }}>Remove from routine</Button>
  </>
}

export default function PlanBuilder() {
  const { id } = useParams()
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const openSheet = useUI(s => s.openSheet)
  const isNew = id === 'new'
  const [plan, setPlan] = useState(isNew ? blankPlan() : null)
  const [dirty, setDirty] = useState(isNew)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) return
    api('/api/coach/plans')
      .then(d => {
        const p = d.plans.find(x => x.id === id)
        if (p) setPlan(clone(p))
        else { toast('Plan not found'); nav('/c/plans', { replace: true }) }
      })
      .catch(e => toast(e.message || 'Could not load the plan'))
  }, [id])

  if (!plan) return <div className="narrow"><div className="muted small" style={{ paddingTop: 40 }}>Loading…</div></div>

  const edit = fn => { setPlan(p => { const next = clone(p); fn(next); return next }); setDirty(true) }
  const routines = plan.bundle.routines
  const editEx = (ri, fn) => edit(p => fn(p.bundle.routines[ri].ex))
  // A custom exercise may only exist in this plan (another coach's, or one since deleted), so its
  // name comes from the plan before falling back to the library.
  const nameOf = exId => (plan.bundle.customEx || []).find(c => c.id === exId)?.n || exOr(exId).n

  const addRoutine = () => edit(p => {
    p.bundle.routines.push({ id: uid(), name: 'Day ' + (p.bundle.routines.length + 1), emoji: DEFAULT_GLYPH, ex: [] })
  })
  const removeRoutine = ri => confirmSheet({
    title: 'Remove ' + routines[ri].name + '?', message: 'Its exercises, and any weekday it was scheduled on, are removed from this plan.',
    confirmText: 'Remove', danger: true,
    onConfirm: () => edit(p => {
      const rid = p.bundle.routines[ri].id
      p.bundle.routines.splice(ri, 1)
      for (const d of Object.keys(p.bundle.week)) if (p.bundle.week[d] === rid) delete p.bundle.week[d]
    })
  })
  const addExercise = ri => exercisePicker(ex =>
    exConfigSheet(ex, null, cfg => editEx(ri, list => { list.push({ id: ex.id, ...cfg }) }), null, routines[ri]))
  const moveEx = (ri, xi, dir) => editEx(ri, list => {
    const j = xi + dir
    if (j >= 0 && j < list.length) [list[xi], list[j]] = [list[j], list[xi]]
  })
  const openExercise = (ri, xi) => {
    const cfg = routines[ri].ex[xi]
    openSheet(close => <ExtrasSheet name={nameOf(cfg.id)} cfg={cfg} unit={S.unit} close={close}
      onSave={({ rest, note }) => editEx(ri, list => {
        const next = { ...list[xi] }
        if (rest > 0) next.rest = rest; else delete next.rest
        if (note) next.note = note; else delete next.note
        list[xi] = next
      })}
      onEdit={() => exConfigSheet(exOr(cfg.id), cfg, updated => editEx(ri, list => {
        // The shared sheet only knows sets/reps/progression, so keep the coach's rest and cue.
        list[xi] = { id: cfg.id, ...(cfg.sg ? { sg: cfg.sg } : {}), ...updated, ...(cfg.rest ? { rest: cfg.rest } : {}), ...(cfg.note ? { note: cfg.note } : {}) }
      }), null, routines[ri])}
      onRemove={() => editEx(ri, list => { list.splice(xi, 1) })} />)
  }

  const save = async () => {
    setSaving(true)
    const used = new Set(plan.bundle.routines.flatMap(r => r.ex.map(e => e.id)))
    // A custom exercise has to travel inside the plan, or it arrives as a blank row for the client.
    const own = (S.customEx || []).filter(c => used.has(c.id)).map(c => ({ id: c.id, n: c.n, bp: c.bp, ...(c.desc ? { desc: c.desc } : {}) }))
    const kept = (plan.bundle.customEx || []).filter(c => used.has(c.id) && !own.some(o => o.id === c.id))
    const r = await post('/api/coach/plans/save', {
      id: plan.id || undefined, name: plan.name, category: plan.category, notes: plan.notes,
      bundle: { ...plan.bundle, customEx: [...own, ...kept] }
    })
    setSaving(false)
    if (!r) return
    setDirty(false)
    toast('Plan saved')
    if (isNew) nav('/c/plan/' + r.plan.id, { replace: true })
    else setPlan(clone(r.plan))
  }
  const del = () => confirmSheet({
    title: 'Delete this plan?', message: 'Clients who were already assigned it keep their copy.', confirmText: 'Delete plan', danger: true,
    onConfirm: async () => { if (await post('/api/coach/plans/delete', { id: plan.id })) { toast('Plan deleted'); nav('/c/plans') } }
  })
  const leave = () => (dirty
    ? confirmSheet({ title: 'Leave without saving?', message: 'Your changes to this plan will be lost.', confirmText: 'Leave', danger: true, onConfirm: () => nav('/c/plans') })
    : nav('/c/plans'))
  const routineOptions = [{ value: '', label: 'Rest' }, ...routines.map(r => ({ value: r.id, label: r.name }))]

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={leave} aria-label="Back to plans"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, margin: '0 12px' }}>
        <input className="input" value={plan.name} maxLength={60} aria-label="Plan name" style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.021em' }}
          onChange={e => { const v = e.target.value; edit(p => { p.name = v }) }} />
      </div>
    </div>

    <div className="sect-b" style={{ marginBottom: 10 }}>
      <SelectRow icon="folder" title="Category" sheetTitle="Category" value={plan.category}
        options={CATEGORIES.map(c => ({ value: c, label: c }))} onChange={v => edit(p => { p.category = v })} />
    </div>
    <textarea className="input" rows={3} maxLength={1000} placeholder="Notes for clients: the goal of this plan, how to approach it…"
      value={plan.notes} onChange={e => { const v = e.target.value; edit(p => { p.notes = v }) }} />

    <h4 className="sec">Week schedule</h4>
    <div className="sect-b">
      {WEEK.map(d => <SelectRow key={d} title={DAYN[d]} sheetTitle={DAYN[d]} value={plan.bundle.week[d] || ''} options={routineOptions}
        onChange={v => edit(p => { if (v) p.bundle.week[d] = v; else delete p.bundle.week[d] })} />)}
    </div>

    <div className="row between" style={{ margin: '22px 0 10px' }}>
      <h4 className="sec" style={{ margin: 0 }}>Routines</h4>
      <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>Routine</Button>
    </div>
    {routines.map((r, ri) => <div key={r.id} className="card">
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className="iconbtn" aria-label="Pick an icon" onClick={() => glyphPicker(r.emoji, g => edit(p => { p.bundle.routines[ri].emoji = g }))}><Icon name={glyphOf(r.emoji)} /></button>
        <input className="input" value={r.name} maxLength={60} aria-label="Routine name" style={{ fontWeight: 600 }}
          onChange={e => { const v = e.target.value; edit(p => { p.bundle.routines[ri].name = v }) }} />
        {routines.length > 1 && <button className="iconbtn" aria-label="Remove routine" style={{ color: 'var(--red)' }} onClick={() => removeRoutine(ri)}><Icon name="trash" /></button>}
      </div>
      <div className="sect-b" style={{ marginBottom: 10 }}>
        <SelectRow icon="chartLine" title="Progression" sheetTitle="Progression" value={r.prog || 'linear'}
          options={POLICIES_FOR.reps.map(v => ({ value: v, label: POLICY_NAME[v] }))} onChange={v => edit(p => { p.bundle.routines[ri].prog = v })} />
      </div>
      <div className="list">
        {r.ex.map((e, xi) => <div key={xi} className="item" onClick={() => openExercise(ri, xi)}>
          <Thumb ex={exOr(e.id)} />
          <div className="grow"><div className="tt capitalize">{nameOf(e.id)}</div>
            <div className="ss">{exLine(e, S.unit)}{e.rest ? ` · rest ${e.rest}s` : ''}{e.note ? ' · has a cue' : ''}</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none' }}>
            <button className="iconbtn" aria-label="Move up" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); moveEx(ri, xi, -1) }}><Icon name="chevronUp" /></button>
            <button className="iconbtn" aria-label="Move down" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); moveEx(ri, xi, 1) }}><Icon name="chevronDown" /></button>
          </div>
        </div>)}
        {!r.ex.length && <div className="dim small" style={{ padding: '4px 2px' }}>No exercises yet.</div>}
      </div>
      <div style={{ height: 10 }} />
      <Button size="sm" variant="tinted" icon="plus" onClick={() => addExercise(ri)}>Add exercise</Button>
    </div>)}

    <div style={{ height: 6 }} />
    <Button variant="primary" icon="check" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save plan' : 'Saved'}</Button>
    {plan.id && <>
      <div style={{ height: 8 }} />
      <Button icon="send" disabled={dirty} onClick={() => assignSheet({ planId: plan.id })}>{dirty ? 'Save before assigning' : 'Assign to clients'}</Button>
      <div style={{ height: 8 }} />
      <Button variant="danger" icon="trash" onClick={del}>Delete plan</Button>
    </>}
  </div>
}
