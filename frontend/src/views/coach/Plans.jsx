import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast } from '../../lib/useApi.js'
import { PRESETS, PRESET_CATEGORIES, buildPreset } from '../../lib/presets.js'
import { glyphOf } from '../../lib/glyphs.js'
import { EXDB } from '../../lib/exercises.js'
import { buildCandidates } from '../../lib/aicandidates.js'
import { findCatalogueMatch } from '../../lib/exsearch.js'
import { dedupeAiCustoms } from '../../lib/plan-share.js'
import { assignSheet } from './assign.jsx'
import Icon from '../../components/Icon.jsx'
import { Button, Segmented } from '../../components/ui.jsx'

// A coach's plan library. Plans are built once and assigned to many clients; each assignment keeps
// its own copy, so editing a plan here never changes what a client is already partway through.

function TemplateSheet({ close, onPick }) {
  return <>
    <h3>Start from a template</h3>
    <div className="muted small" style={{ marginBottom: 4 }}>Creates a new plan from the template, which you can then edit before assigning it.</div>
    {PRESET_CATEGORIES.map(cat => <div key={cat}>
      <h4 className="sec">{cat}</h4>
      <div className="list">
        {PRESETS.filter(p => p.category === cat).map(p => <div key={p.key} className="item" onClick={() => { close(); onPick(p.key) }}>
          <div className="thumb thumb-x"><Icon name={glyphOf(p.glyph)} /></div>
          <div className="grow"><div className="tt">{p.name}</div><div className="ss">{p.days} · {p.level} · {p.kit}</div></div>
          <Icon name="plus" className="chev" />
        </div>)}
      </div>
    </div>)}
  </>
}

// AI draft: the coach describes the client, the model builds a plan from the coach's own exercise
// library (buildCandidates decides what it may choose from), and it's saved through the normal path
// so a hand-made plan and an AI one are identical from here on. Shown only when the server has AI set up.
const EQUIP = ['barbell', 'dumbbell', 'machine', 'cable', 'body weight', 'kettlebell', 'resistance band']
const EXPERIENCE = [{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]

function GenerateSheet({ close, onDone }) {
  const [goal, setGoal] = useState('Build muscle')
  const [perWeek, setPerWeek] = useState(3)
  const [experience, setExperience] = useState('intermediate')
  const [equipment, setEquipment] = useState([])
  const [busy, setBusy] = useState(false)
  const toggle = e => setEquipment(x => (x.includes(e) ? x.filter(y => y !== e) : [...x, e]))

  const go = async () => {
    const candidates = buildCandidates(EXDB, { equipment })
    if (candidates.length < 5) { toast('Pick more equipment — not enough exercises to choose from.'); return }
    setBusy(true)
    const r = await post('/api/ai/plan', { goal, perWeek, experience, equipment: equipment.join(', '), candidates })
    if (!r) { setBusy(false); return }   // post() already toasted the reason
    // The model saw only a slice of the library; reuse any invented exercise that's really in the catalogue.
    const bundle = dedupeAiCustoms(r.plan.bundle, name => findCatalogueMatch(name, EXDB))
    const saved = await post('/api/coach/plans/save', { name: r.plan.name, category: r.plan.category, notes: r.plan.notes, bundle })
    setBusy(false)
    if (saved) { close(); toast('AI plan created — review and edit it'); onDone(saved.plan.id) }
  }

  return <>
    <h3>Generate with AI</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>Describe the client and the AI drafts a plan you can edit before assigning. It only picks from your exercise library.</div>
    <input className="input" maxLength={120} placeholder="Goal — e.g. build muscle, lose fat, get stronger" value={goal} onChange={e => setGoal(e.target.value)} />
    <h4 className="sec">Days per week</h4>
    <div className="chips">{[2, 3, 4, 5, 6].map(d => <button key={d} className={'chip' + (perWeek === d ? ' on' : '')} onClick={() => setPerWeek(d)}>{d}</button>)}</div>
    <h4 className="sec">Experience</h4>
    <Segmented options={EXPERIENCE} value={experience} onChange={setExperience} />
    <h4 className="sec">Equipment</h4>
    <div className="chips">{EQUIP.map(e => <button key={e} className={'chip nocap' + (equipment.includes(e) ? ' on' : '')} onClick={() => toggle(e)}>{e}</button>)}</div>
    <div className="dim small" style={{ margin: '6px 2px 14px' }}>Leave empty to use everything.</div>
    <Button variant="primary" icon="bolt" disabled={busy} onClick={go}>{busy ? 'Generating…' : 'Generate plan'}</Button>
  </>
}

export default function Plans() {
  const nav = useNavigate()
  const openSheet = useUI(s => s.openSheet)
  const { data, error } = useApi('/api/coach/plans')
  const config = useApi('/api/config')
  const [cat, setCat] = useState('')

  const plans = data?.plans || []
  const cats = [...new Set(plans.map(p => p.category))]
  const shown = plans.filter(p => !cat || p.category === cat)

  const fromTemplate = async key => {
    const { preset, routines, week } = buildPreset(key)
    const r = await post('/api/coach/plans/save', { name: preset.name, category: preset.category, notes: preset.blurb, bundle: { routines, week, customEx: [] } })
    if (r) { toast('Plan created from ' + preset.name); nav('/c/plan/' + r.plan.id) }
  }

  return <div className="narrow">
    <div className="hdr">
      <div><h1>Plans</h1><div className="sub">{data ? `${plans.length} plan${plans.length === 1 ? '' : 's'}` : 'Loading…'}</div></div>
      <button className="iconbtn" aria-label="New plan" onClick={() => nav('/c/plan/new')}><Icon name="plus" /></button>
    </div>
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}

    <div className="row" style={{ gap: 8, marginBottom: 12 }}>
      <Button size="sm" variant="primary" icon="plus" onClick={() => nav('/c/plan/new')}>New plan</Button>
      <Button size="sm" icon="sparkles" onClick={() => openSheet(close => <TemplateSheet close={close} onPick={fromTemplate} />)}>From a template</Button>
      {config.data?.ai && <Button size="sm" icon="bolt" onClick={() => openSheet(close => <GenerateSheet close={close} onDone={id => nav('/c/plan/' + id)} />)}>Generate with AI</Button>}
    </div>

    {cats.length > 1 && <div className="chips" style={{ marginBottom: 10 }}>
      <button className={'chip nocap' + (!cat ? ' on' : '')} onClick={() => setCat('')}>All</button>
      {cats.map(c => <button key={c} className={'chip nocap' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
    </div>}

    <div className="list">
      {shown.map(p => {
        const n = p.bundle.routines.length, days = Object.keys(p.bundle.week || {}).length
        return <div key={p.id} className="item" onClick={() => nav('/c/plan/' + p.id)}>
          <span className="lrow-i"><Icon name={glyphOf(p.bundle.routines[0]?.emoji)} /></span>
          <div className="grow"><div className="tt">{p.name}</div>
            <div className="ss">{p.category} · {n} routine{n === 1 ? '' : 's'} · {days ? `${days} day${days === 1 ? '' : 's'} a week` : 'no schedule'}</div></div>
          <button className="iconbtn" aria-label="Assign to clients" style={{ width: 34, height: 32, fontSize: 16 }}
            onClick={ev => { ev.stopPropagation(); assignSheet({ planId: p.id }) }}><Icon name="send" /></button>
          <Icon name="chevronRight" className="chev" />
        </div>
      })}
      {data && !shown.length && <div className="empty"><div className="ico"><Icon name="clipboard" /></div>No plans yet — build one, or start from a template.</div>}
    </div>
  </div>
}
