import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { api } from '../../lib/api.js'
import { useApi, toast } from '../../lib/useApi.js'
import { useLive, useLiveEvent } from '../../lib/events.js'
import { sendText, sendFile, markChatRead, recorderMime, refreshChatUnread } from '../../lib/chat.js'
import { groupByDay, dayLabel, timeOf, fmtBytes, fmtClock, presenceText, mergeMessage, mergeMessages, applyReceipt, initials, EMOJI } from '../../lib/chatfmt.js'
import { mediaUrl } from '../../lib/media.js'
import { isCoach } from '../../lib/roles.js'
import { t } from '../../lib/i18n.js'
import Icon from '../../components/Icon.jsx'
import { Button } from '../../components/ui.jsx'

// One conversation between a coach and a client: text, emoji, photos, voice notes and documents, with
// read receipts and whether the other person is online. New messages and receipts arrive over the live
// event stream. Everything sent goes through the server, which checks the two are still linked and active.

const FILE_TYPES = 'image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt'
// On a phone, Enter makes a new line and the send button sends; with a keyboard, Enter sends.
const touchFirst = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

function PhotoSheet({ m }) {
  return <>
    <img src={mediaUrl(m.media.id)} alt={t('Photo')} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
    <div className="small muted" style={{ marginTop: 8 }}>{dayLabel(m.created)} · {timeOf(m.created)}</div>
  </>
}

function FileLink({ m }) {
  return <a className="msg-file" href={mediaUrl(m.media.id)} target="_blank" rel="noopener noreferrer">
    <Icon name="doc" />
    <span className="grow"><span className="nm">{m.media.name}</span><span className="sz">{fmtBytes(m.media.size)}</span></span>
    <Icon name="download" />
  </a>
}

function Voice({ m }) {
  return <div className="msg-voice">
    <audio controls preload="metadata" src={mediaUrl(m.media.id)} />
    {m.media.duration > 0 && <span className="dur">{fmtClock(m.media.duration)}</span>}
  </div>
}

function Bubble({ m, mine, openPhoto, onMedia }) {
  return <div className={'msg' + (mine ? ' mine' : '')} data-id={m.id}>
    <div className={'bubble' + (m.kind === 'photo' ? ' has-photo' : '')}>
      {m.kind === 'photo' && <button className="msg-photo" onClick={() => openPhoto(m)} aria-label={t('Open photo')}>
        <img src={mediaUrl(m.media.id)} alt={t('Photo')} loading="lazy" onLoad={onMedia} />
      </button>}
      {m.kind === 'voice' && <Voice m={m} />}
      {m.kind === 'file' && <FileLink m={m} />}
      {m.text && <div className="txt">{m.text}</div>}
      <div className="meta">
        {timeOf(m.created)}
        {mine && <span className={'tick' + (m.readAt ? ' read' : '')} role="img" aria-label={m.readAt ? t('Read') : t('Sent')}>
          <Icon name={m.readAt ? 'checks' : 'check'} />
        </span>}
      </div>
    </div>
  </div>
}

function SearchSheet({ peerId, close, onJump }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  useEffect(() => {
    if (!q.trim()) { setResults(null); return }
    const id = setTimeout(() => {
      api(`/api/chat/search?peer=${encodeURIComponent(peerId)}&q=${encodeURIComponent(q.trim())}`)
        .then(d => setResults(d.results)).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(id)
  }, [q, peerId])
  return <>
    <h3>{t('Search messages')}</h3>
    <input className="input" autoFocus placeholder={t('Search')} aria-label={t('Search messages')} value={q} onChange={e => setQ(e.target.value)} />
    <div className="list" style={{ marginTop: 10 }}>
      {(results || []).map(m => <div key={m.id} className="item" onClick={() => { close(); onJump(m) }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="tt ellipsis">{m.text || m.media?.name}</div>
          <div className="ss">{dayLabel(m.created)} · {timeOf(m.created)}</div>
        </div>
      </div>)}
      {results && !results.length && <div className="empty small">{t('No messages match.')}</div>}
    </div>
  </>
}

function GallerySheet({ peerId, openPhoto }) {
  const { data } = useApi('/api/chat/media?peer=' + encodeURIComponent(peerId))
  if (!data) return <h3>{t('Photos and files')}</h3>
  const of = kind => data.items.filter(m => m.kind === kind)
  const photos = of('photo'), voice = of('voice'), files = of('file')
  return <>
    <h3>{t('Photos and files')}</h3>
    <h4 className="sec">{t('Photos')} · {photos.length}</h4>
    {photos.length
      ? <div className="gallery">{photos.map(m => <img key={m.id} src={mediaUrl(m.media.id)} alt={t('Photo')} loading="lazy" onClick={() => openPhoto(m)} />)}</div>
      : <div className="muted small">{t('No photos yet.')}</div>}
    <h4 className="sec">{t('Voice messages')} · {voice.length}</h4>
    {voice.length
      ? voice.map(m => <div key={m.id} className="gallery-row"><Voice m={m} /><span className="small dim">{dayLabel(m.created)}</span></div>)
      : <div className="muted small">{t('No voice messages yet.')}</div>}
    <h4 className="sec">{t('Documents')} · {files.length}</h4>
    {files.length ? files.map(m => <FileLink key={m.id} m={m} />) : <div className="muted small">{t('No documents yet.')}</div>}
  </>
}

export default function Conversation() {
  const { peer: peerId } = useParams()
  const nav = useNavigate()
  const me = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  const live = useLive(s => s.presence[peerId])

  const [peer, setPeer] = useState(null)
  const [messages, setMessages] = useState([])
  const [more, setMore] = useState(false)
  const [canSend, setCanSend] = useState(false)
  const [error, setError] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [emoji, setEmoji] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const fileRef = useRef(null), inputRef = useRef(null), endRef = useRef(null)
  const rec = useRef(null)
  const stick = useRef(true)   // follow the newest message, unless the reader has scrolled up
  const listRef = useRef(messages); listRef.current = messages
  const moreRef = useRef(more); moreRef.current = more
  const url = (extra = '') => `/api/chat/messages?peer=${encodeURIComponent(peerId)}${extra}`

  useEffect(() => {
    let alive = true
    setPeer(null); setMessages([]); setError(null); stick.current = true
    api(url()).then(d => {
      if (!alive) return
      setPeer(d.peer); setMessages(d.messages); setMore(d.more); setCanSend(d.canSend)
      markChatRead(peerId).then(refreshChatUnread)
    }).catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [peerId])

  const toEnd = () => endRef.current?.scrollIntoView({ block: 'end' })
  useLayoutEffect(() => { if (stick.current) toEnd() }, [messages])
  const onMedia = () => { if (stick.current) toEnd() }
  useEffect(() => {
    const onScroll = () => { stick.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140 }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLiveEvent('message', m => {
    const theirs = m.from === peerId && m.to === me?.id
    if (!theirs && !(m.from === me?.id && m.to === peerId)) return
    setMessages(list => mergeMessage(list, m))
    if (theirs && document.visibilityState === 'visible') markChatRead(peerId)
  })
  // Their receipt ticks my messages; my own receipt (from this or another tab) settles theirs.
  useLiveEvent('read', r => { if (r.by === peerId || r.by === me?.id) setMessages(list => applyReceipt(list, r)) })
  // Catches up with the server: messages and receipts missed while the stream was down, and whether
  // sending is allowed now. Pausing or renewing someone changes that without any message being sent.
  const refresh = () => api(url()).then(d => {
    setPeer(d.peer)
    setCanSend(d.canSend)
    setMessages(list => mergeMessages(list, d.messages))
    if (document.visibilityState === 'visible' && d.messages.some(m => m.from === peerId && !m.readAt)) markChatRead(peerId)
  }).catch(() => {})
  useLiveEvent('resync', refresh)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [peerId])

  // Leaving mid-recording drops the recording and lets go of the microphone.
  useEffect(() => () => {
    const r = rec.current
    if (!r) return
    r.cancelled = true
    try { r.recorder.stop() } catch { /* already stopped */ }
    r.stream.getTracks().forEach(tr => tr.stop())
  }, [])
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setElapsed((Date.now() - (rec.current?.started || Date.now())) / 1000), 250)
    return () => clearInterval(id)
  }, [recording])
  useEffect(() => { if (!text && inputRef.current) inputRef.current.style.height = '' }, [text])

  const deliver = async (work, onFail) => {
    setBusy(true)
    try {
      const m = await work()
      stick.current = true
      setMessages(list => mergeMessage(list, m))
    } catch (e) {
      toast(e.message || t('Could not send'))
      if (onFail) onFail()
      if (e.status === 403) refresh()   // most likely one of the two is no longer active
    }
    setBusy(false)
  }

  const send = () => {
    const body = text.trim()
    if (!body || busy) return
    setText('')
    setEmoji(false)
    deliver(() => sendText(peerId, body), () => setText(body))
    inputRef.current?.focus()
  }
  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey && !touchFirst()) { e.preventDefault(); send() } }
  const grow = e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }

  const insertEmoji = em => {
    const el = inputRef.current
    const from = el?.selectionStart ?? text.length, to = el?.selectionEnd ?? from
    setText(text.slice(0, from) + em + text.slice(to))
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(from + em.length, from + em.length) } })
  }

  const attach = ev => {
    const f = ev.target.files[0]
    ev.target.value = ''
    if (f) deliver(() => sendFile(peerId, f))
  }

  const startRecording = async () => {
    const mime = recorderMime()
    if (mime === null || !navigator.mediaDevices?.getUserMedia) { toast(t('Voice messages aren’t supported in this browser.')); return }
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { toast(t('Allow microphone access to record a voice message.')); return }
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const r = { recorder, stream, chunks: [], started: Date.now(), cancelled: false }
    rec.current = r
    recorder.ondataavailable = e => { if (e.data.size) r.chunks.push(e.data) }
    recorder.onstop = () => {
      stream.getTracks().forEach(tr => tr.stop())
      rec.current = null
      setRecording(false)
      setElapsed(0)
      if (r.cancelled || !r.chunks.length) return
      const type = (recorder.mimeType || mime || 'audio/webm').split(';')[0]
      const ext = { 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' }[type] || 'webm'
      const file = new File(r.chunks, `voice-message.${ext}`, { type })
      deliver(() => sendFile(peerId, file, { duration: (Date.now() - r.started) / 1000 }))
    }
    recorder.start()
    setRecording(true)
  }
  const stopRecording = cancel => {
    const r = rec.current
    if (!r) return
    r.cancelled = cancel
    r.recorder.stop()
  }

  const loadEarlier = async () => {
    const first = listRef.current[0]
    if (!first) return
    const height = document.documentElement.scrollHeight
    try {
      const d = await api(url(`&before=${encodeURIComponent(first.id)}`))
      stick.current = false
      setMessages(list => [...d.messages, ...list])
      setMore(d.more)
      requestAnimationFrame(() => window.scrollBy(0, document.documentElement.scrollHeight - height))
    } catch (e) { toast(e.message) }
  }

  // A search result may be older than what is loaded: page back until it is, then scroll to it.
  const jumpTo = async target => {
    let older = [], hasMore = moreRef.current, oldest = listRef.current[0]
    const loaded = () => listRef.current.some(m => m.id === target.id) || older.some(m => m.id === target.id)
    try {
      while (!loaded() && hasMore && oldest) {
        const d = await api(url(`&before=${encodeURIComponent(oldest.id)}&limit=200`))
        older = [...d.messages, ...older]
        hasMore = d.more
        oldest = d.messages[0]
      }
    } catch (e) { toast(e.message); return }
    stick.current = false
    if (older.length) {
      setMessages(list => { const have = new Set(list.map(m => m.id)); return [...older.filter(m => !have.has(m.id)), ...list] })
      setMore(hasMore)
    }
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${CSS.escape(target.id)}"]`)
      if (!el) return
      el.scrollIntoView({ block: 'center' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
    }, 60)
  }

  const openPhoto = m => openSheet(() => <PhotoSheet m={m} />)
  const presence = live || peer

  return <div className="narrow chat">
    <div className="chat-hdr">
      <button className="iconbtn" onClick={() => nav(isCoach(me) ? '/c/chat' : '/coach')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <span className="avatar" aria-hidden="true">{peer ? initials(peer.name) : ''}{presence?.online && <i className="online-dot" />}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="tt ellipsis">{peer?.name || ''}</div>
        <div className={'ss' + (presence?.online ? ' online' : '')}>{peer ? presenceText(presence) : ''}</div>
      </div>
      <button className="iconbtn" disabled={!peer} aria-label={t('Search messages')}
        onClick={() => openSheet(close => <SearchSheet peerId={peerId} close={close} onJump={jumpTo} />)}><Icon name="magnifier" /></button>
      <button className="iconbtn" disabled={!peer} aria-label={t('Photos and files')}
        onClick={() => openSheet(() => <GallerySheet peerId={peerId} openPhoto={openPhoto} />)}><Icon name="image" /></button>
    </div>

    {error && <div className="card small" style={{ color: 'var(--red)' }}>{error}</div>}
    {more && <div style={{ textAlign: 'center', margin: '4px 0 10px' }}>
      <button className="chip nocap" onClick={loadEarlier}>{t('Load earlier messages')}</button>
    </div>}
    {peer && !messages.length && <div className="empty"><div className="ico"><Icon name="chat" /></div>{t('No messages yet. Say hello!')}</div>}

    <div className="thread">
      {groupByDay(messages).map(g => <div key={g.key}>
        <div className="day"><span>{g.label}</span></div>
        {g.items.map(m => <Bubble key={m.id} m={m} mine={m.from === me?.id} openPhoto={openPhoto} onMedia={onMedia} />)}
      </div>)}
      <div ref={endRef} />
    </div>

    {peer && (canSend ? <div className="composer">
      {emoji && <div className="emoji-grid" aria-label={t('Emoji')}>
        {EMOJI.map(e => <button key={e} onClick={() => insertEmoji(e)} aria-label={e}>{e}</button>)}
      </div>}
      {busy && <div className="sending small muted">{t('Sending…')}</div>}
      {recording
        ? <div className="composer-row rec">
          <span className="rec-dot" aria-hidden="true" />
          <span className="money">{fmtClock(elapsed)}</span>
          <span className="grow small muted">{t('Recording…')}</span>
          <button className="iconbtn" onClick={() => stopRecording(true)} aria-label={t('Cancel recording')}><Icon name="trash" /></button>
          <button className="iconbtn send" onClick={() => stopRecording(false)} aria-label={t('Send voice message')}><Icon name="send" /></button>
        </div>
        : <div className="composer-row">
          <button className={'iconbtn' + (emoji ? ' on' : '')} onClick={() => setEmoji(v => !v)} aria-label={t('Emoji')} aria-expanded={emoji}><Icon name="smile" /></button>
          <button className="iconbtn" onClick={() => fileRef.current.click()} disabled={busy} aria-label={t('Attach a photo or file')}><Icon name="paperclip" /></button>
          <textarea ref={inputRef} className="composer-input" rows={1} maxLength={4000} placeholder={t('Message')} aria-label={t('Message')}
            value={text} onChange={e => setText(e.target.value)} onInput={grow} onKeyDown={onKey} />
          {text.trim()
            ? <button className="iconbtn send" onClick={send} disabled={busy} aria-label={t('Send')}><Icon name="send" /></button>
            : <button className="iconbtn" onClick={startRecording} disabled={busy} aria-label={t('Record a voice message')}><Icon name="mic" /></button>}
        </div>}
      <input ref={fileRef} type="file" accept={FILE_TYPES} style={{ display: 'none' }} onChange={attach} />
    </div>
      : <div className="composer paused small muted">
        <div>{t('Messaging is paused while this account isn’t active.')}</div>
        <Button size="sm" variant="ghost" icon="reset" onClick={refresh}>{t('Check again')}</Button>
      </div>)}
  </div>
}
