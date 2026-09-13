import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { todayISO, fmtDate, fmtNum } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { uploadMedia, mediaUrl } from '../../lib/media.js'
import { bwSheet, confirmSheet } from '../../sheets.jsx'
import LineChart from '../../components/LineChart.jsx'
import Icon from '../../components/Icon.jsx'
import Kpi from '../../components/Kpi.jsx'
import { MeasureTable, MEASURE_FIELDS, bmiOf, sortByDay } from '../../components/BodyStats.jsx'
import { Button, Stepper } from '../../components/ui.jsx'

// Body metrics beyond the scale: body fat, muscle mass, tape measurements and progress photos.
// All of it lives in the synced state, which is how a coach reads it — there is no separate upload.

const toast = msg => useUI.getState().toast(msg)

function MetricsSheet({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const last = sortByDay(S.metrics).pop() || {}
  const [height, setHeight] = useState(S.height || 0)
  const [bf, setBf] = useState(last.bf || 0)
  const [mm, setMm] = useState(last.mm || 0)
  const save = () => {
    const d = todayISO()
    update(s => {
      if (height > 0) s.height = height
      // One entry per day: logging again today corrects today rather than adding a second point.
      s.metrics = (s.metrics || []).filter(m => m.d !== d)
      if (bf > 0 || mm > 0) s.metrics.push({ d, ...(bf > 0 ? { bf } : {}), ...(mm > 0 ? { mm } : {}) })
    })
    toast(t('Body metrics saved'))
    close()
  }
  return <>
    <h3>{t('Body metrics')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('From a smart scale or a body-composition test. Leave a value at 0 to skip it.')}</div>
    <div className="row cfgrow" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
      <Stepper label={t('Height (cm)')} value={height} step={1} decimal={false} onChange={setHeight} />
      <Stepper label={t('Body fat (%)')} value={bf} step={0.5} onChange={setBf} />
      <Stepper label={t('Muscle mass ({0})', S.unit)} value={mm} step={0.5} onChange={setMm} />
    </div>
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}

function MeasureSheet({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const last = sortByDay(S.measure).pop() || {}
  const [vals, setVals] = useState(Object.fromEntries(MEASURE_FIELDS.map(([k]) => [k, last[k] || 0])))
  const save = () => {
    const entry = { d: todayISO() }
    for (const [k] of MEASURE_FIELDS) if (vals[k] > 0) entry[k] = vals[k]
    if (Object.keys(entry).length === 1) { toast(t('Enter at least one measurement')); return }
    update(s => { s.measure = [...(s.measure || []).filter(m => m.d !== entry.d), entry] })
    toast(t('Measurements saved'))
    close()
  }
  return <>
    <h3>{t('Measurements')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('In centimetres, measured the same way each time. Leave a value at 0 to skip it.')}</div>
    <div className="row cfgrow" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
      {MEASURE_FIELDS.map(([k, label]) => <Stepper key={k} label={t(label)} value={vals[k]} step={0.5} onChange={v => setVals(x => ({ ...x, [k]: v }))} />)}
    </div>
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}

function PhotoSheet({ p, close }) {
  const update = useStore(s => s.update)
  const remove = () => confirmSheet({
    title: t('Remove this photo?'), message: t('It is removed from your progress photos.'), confirmText: t('Remove'), danger: true,
    onConfirm: () => { update(s => { s.photos = (s.photos || []).filter(x => x.id !== p.id) }); close() }
  })
  return <>
    <h3>{fmtDate(p.d, true)}</h3>
    <img src={mediaUrl(p.id)} alt={t('Progress photo from {0}', fmtDate(p.d, true))} style={{ width: '100%', borderRadius: 12, display: 'block', marginBottom: 12 }} />
    <Button variant="danger" icon="trash" onClick={remove}>{t('Remove photo')}</Button>
  </>
}

export default function Progress() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const openSheet = useUI(s => s.openSheet)
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const bw = sortByDay(S.bodyweight)
  const weight = bw.length ? bw[bw.length - 1].w : null
  const metrics = sortByDay(S.metrics)
  const last = metrics[metrics.length - 1] || {}
  const bmi = weight != null ? bmiOf(weight, S.height, S.unit) : null
  const series = key => metrics.filter(m => m[key] != null).map(m => ({ t: Date.parse(m.d), y: m[key], d: m.d }))
  const bf = series('bf'), mm = series('mm')
  const photos = sortByDay(S.photos).reverse()

  const addPhoto = async ev => {
    const file = ev.target.files[0]
    ev.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const media = await uploadMedia(file, { purpose: 'photo' })
      update(s => { s.photos = [...(s.photos || []), { d: todayISO(), id: media.id }] })
      toast(t('Photo added'))
    } catch (e) { toast(e.message || t('Upload failed')) }
    setBusy(false)
  }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Progress')}</h1><div className="sub">{t('Body metrics, measurements and photos')}</div></div>
    </div>

    <div className="kpis">
      <Kpi icon="scale" label={t('Weight')} value={weight != null ? `${fmtNum(weight)} ${S.unit}` : '—'} />
      <Kpi icon="figureStrength" label={t('BMI')} value={bmi ?? '—'} sub={S.height ? t('height {0} cm', S.height) : t('add your height')} />
      <Kpi icon="target" label={t('Body fat')} value={last.bf != null ? fmtNum(last.bf) + '%' : '—'} />
      <Kpi icon="arm" label={t('Muscle mass')} value={last.mm != null ? `${fmtNum(last.mm)} ${S.unit}` : '—'} />
    </div>
    <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Weight')}</Button>
      <Button size="sm" icon="plus" onClick={() => openSheet(close => <MetricsSheet close={close} />)}>{t('Body metrics')}</Button>
      <Button size="sm" icon="ruler" onClick={() => openSheet(close => <MeasureSheet close={close} />)}>{t('Measurements')}</Button>
    </div>

    {(bf.length > 0 || mm.length > 0) && <div className="card"><h2>{t('Body composition')}</h2>
      {bf.length > 0 && <><div className="small muted">{t('Body fat (%)')}</div><div className="chart"><LineChart points={bf} h={110} unit="%" /></div></>}
      {mm.length > 0 && <><div className="small muted" style={{ marginTop: 10 }}>{t('Muscle mass')}</div><div className="chart"><LineChart points={mm} h={110} unit={S.unit} color="var(--teal)" /></div></>}
    </div>}

    <div className="card"><h2>{t('Measurements')}</h2><MeasureTable measure={S.measure} /></div>

    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{t('Progress photos')}</h2>
        {user && <Button size="sm" icon="camera" disabled={busy} onClick={() => fileRef.current.click()}>{busy ? t('Uploading…') : t('Add')}</Button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={addPhoto} />
      {photos.length ? <div className="gallery">{photos.map(p => <img key={p.id} src={mediaUrl(p.id)} alt={t('Progress photo from {0}', fmtDate(p.d, true))} loading="lazy"
        onClick={() => openSheet(close => <PhotoSheet p={p} close={close} />)} />)}</div>
        : <div className="muted small">{user ? t('Take a photo in the same spot and light every few weeks — change is easier to see than to feel.') : t('Sign in to keep progress photos.')}</div>}
    </div>
  </div>
}
