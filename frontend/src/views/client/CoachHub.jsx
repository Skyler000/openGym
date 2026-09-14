import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { useApi, post, toast } from '../../lib/useApi.js'
import { parsePlan, mergePlan } from '../../lib/plan-share.js'
import { schemeOf } from '../../lib/presets.js'
import { exOr } from '../../lib/exercises.js'
import { DAYN, fmtDate } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { pct } from '../../lib/roles.js'
import { useChatUnread } from '../../lib/chat.js'
import Icon from '../../components/Icon.jsx'
import { Button } from '../../components/ui.jsx'
import NotifyPrompt from '../../components/NotifyPrompt.jsx'

// A client's view of their coach: the plans they have been assigned, and how they are doing on them.
// Adding a plan goes through the same tested merge as importing a shared plan file (plan-share.js).

const WEEK = [1, 2, 3, 4, 5, 6, 0]

function AddSheet({ a, close, onAdded }) {
  const update = useStore(s => s.update)
  const hasPlan = useStore(s => s.S.routines.length > 0)
  const add = async schedule => {
    let parsed
    try { parsed = parsePlan(a.bundle) } catch (e) { toast(e.message); return }
    update(s => { mergePlan(s, parsed, { schedule }) })
    close()
    await post('/api/client/assignment/added', { id: a.id })
    toast(schedule ? t('Added — your week now follows this plan') : t('Routines added to your plan'))
    onAdded()
  }
  return <>
    <h3>{t('Add to your week')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Adds the routines from “{0}” to your plan.', a.planName)}</div>
    <Button variant="primary" icon="calendar" onClick={() => add(true)}>{t('Add and follow its schedule')}</Button>
    <div className="dim small" style={{ margin: '6px 2px 14px' }}>
      {hasPlan ? t('Your week schedule is replaced by your coach’s. Routines you already have stay in your plan.') : t('Sets your week to the days your coach planned.')}
    </div>
    <Button icon="plus" onClick={() => add(false)}>{t('Add routines only')}</Button>
  </>
}

function PreviewSheet({ a }) {
  const days = WEEK.filter(d => a.bundle.week?.[d])
  const nameOf = id => (a.bundle.customEx || []).find(c => c.id === id)?.n || exOr(id).n
  return <>
    <h3>{a.planName}</h3>
    {a.notes && <div className="exnote">{a.notes}</div>}
    {days.length > 0 && <>
      <h4 className="sec">{t('Week schedule')}</h4>
      {days.map(d => <div key={d} className="small row between" style={{ padding: '3px 0' }}>
        <span>{t(DAYN[d])}</span><span className="muted">{(a.bundle.routines.find(r => r.id === a.bundle.week[d]) || {}).name}</span>
      </div>)}
    </>}
    {a.bundle.routines.map(r => <div key={r.id}>
      <h4 className="sec">{r.name}</h4>
      {r.ex.map((e, i) => <div key={i} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--sep)' }}>
        <div className="row between"><span className="capitalize">{nameOf(e.id)}</span><span className="muted">{schemeOf(e)}</span></div>
        {e.note && <div className="dim" style={{ marginTop: 3 }}>{e.note}</div>}
      </div>)}
    </div>)}
  </>
}

export default function CoachHub() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const unread = useChatUnread(s => s.unread)
  const openSheet = useUI(s => s.openSheet)
  const { data, error, reload } = useApi('/api/client/assignments')
  const list = data?.assignments || []

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Coach')}</h1><div className="sub">{data?.coach?.name || user?.coachName || ''}</div></div>
      <div className="row" style={{ gap: 8 }}>
        {user?.coachId && <button className="iconbtn badged" onClick={() => nav('/chat/' + user.coachId)}
          aria-label={unread ? t('Message your coach, {0} unread', unread) : t('Message your coach')}>
          <Icon name="chat" />{unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
        </button>}
        <button className="iconbtn" onClick={() => nav('/progress')} aria-label={t('Progress')}><Icon name="ruler" /></button>
      </div>
    </div>
    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}
    <NotifyPrompt />

    <h4 className="sec">{t('Plans from your coach')}</h4>
    {list.map(a => <div key={a.id} className="card">
      <div className="row between" style={{ marginBottom: 4, gap: 8 }}>
        <h2 style={{ margin: 0 }}>{a.planName}</h2>
        {a.category && <span className="tag">{t(a.category)}</span>}
      </div>
      <div className="small muted">
        {t('From {0}', fmtDate(a.start, true))}{a.end ? ' ' + t('to {0}', fmtDate(a.end, true)) : ''}
      </div>
      {a.note && <div className="exnote coach-note small" style={{ marginTop: 10, marginBottom: 0 }}><Icon name="chat" /><span>{a.note}</span></div>}
      {a.rate != null && <div style={{ marginTop: 10 }}>
        <div className="small row between"><span className="muted">{t('Sessions done')}</span><span className="money">{a.done}/{a.planned} · {pct(a.rate)}</span></div>
        <div className="bar" style={{ marginTop: 5 }}><i style={{ width: pct(a.rate) }} /></div>
      </div>}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <Button size="sm" onClick={() => openSheet(() => <PreviewSheet a={a} />)}>{t('View plan')}</Button>
        <Button size="sm" variant={a.addedAt ? 'plain' : 'primary'} icon={a.addedAt ? 'check' : 'plus'}
          onClick={() => openSheet(close => <AddSheet a={a} close={close} onAdded={reload} />)}>{a.addedAt ? t('Added — add again') : t('Add to my week')}</Button>
      </div>
    </div>)}
    {data && !list.length && <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('Your coach hasn’t assigned you a plan yet.')}</div>}
  </div>
}
