import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast } from '../../lib/useApi.js'
import { PRESETS, PRESET_CATEGORIES, buildPreset } from '../../lib/presets.js'
import { glyphOf } from '../../lib/glyphs.js'
import { assignSheet } from './assign.jsx'
import Icon from '../../components/Icon.jsx'
import { Button } from '../../components/ui.jsx'

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

export default function Plans() {
  const nav = useNavigate()
  const openSheet = useUI(s => s.openSheet)
  const { data, error } = useApi('/api/coach/plans')
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
