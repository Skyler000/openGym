import { useState, useRef, useEffect } from 'react'
import { useStore, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyLogin, passkeyRegister, passwordLogin, passwordRegister, api, BIO } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// Signing in and signing up. A passkey where the browser supports one; a username and password where
// the server allows it (PASSWORD_LOGIN) — the way in on devices and browsers without passkeys, which is
// anything not on HTTPS or localhost. Either way, every account after the first needs an invite code.

const toast = msg => useUI.getState().toast(msg)
const cancelled = e => e?.name === 'NotAllowedError' || e?.name === 'AbortError'

// Whether an invite is required and whether password sign-in is on. Null until the server answers.
export function useAuthConfig() {
  const [cfg, setCfg] = useState(null)
  useEffect(() => { api('/api/config').then(setCfg).catch(() => setCfg({})) }, [])
  return cfg
}

// After signing in or up: a new account takes over whatever this device already holds; an existing one
// loads its own data.
export async function arrive(user, { created = false } = {}) {
  const { setUser, pushState, pullState } = useStore.getState()
  setUser(user)
  if (created && hasData(useStore.getState().S)) {
    await pushState()
    toast(t('Profile created — data from this device moved into it'))
  } else {
    await pullState()
    toast(created ? t('Welcome, {0}', user.name) : t('Welcome back, {0}', user.name))
  }
}

export function RegisterSheet({ close }) {
  const cfg = useAuthConfig()
  const passkeys = webauthnOK()
  const [usePassword, setUsePassword] = useState(!passkeys)
  const [name, setName] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])

  if (!cfg) return <h3>{t('Create your profile')}</h3>
  const inviteOnly = !!cfg.invite_only
  const canPassword = !!cfg.password_login
  if (!passkeys && !canPassword) return <>
    <h3>{t('Create your profile')}</h3>
    <div className="muted small">{t("This browser doesn't support passkeys — you can still use WinterARC locally on this device.")}</div>
  </>
  const byPassword = canPassword && (usePassword || !passkeys)

  const go = async () => {
    const n = name.trim()
    if (!n) { toast(t('Enter a name')); return }
    if (byPassword && (!login.trim() || !password)) { toast(t('Choose a username and a password')); return }
    if (inviteOnly && !code.trim()) { toast(t('An invite code is required')); return }
    setBusy(true)
    try {
      const u = byPassword
        ? await passwordRegister({ name: n, login: login.trim(), password, code: code.trim() })
        : await passkeyRegister(n, code.trim())
      close()
      await arrive(u, { created: true })
    } catch (e) {
      if (!cancelled(e)) toast(e.message || t('Registration failed'))
      setBusy(false)
    }
  }

  return <>
    <h3>{t('Create your profile')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {byPassword ? t('Pick your name, a username and a password.') : t('Pick a name, then confirm with {0}. The passkey is saved in your device — no password needed.', BIO)}
    </div>
    <input ref={ref} className="input" placeholder={t('Your name')} aria-label={t('Your name')} maxLength={40} value={name} onChange={e => setName(e.target.value)} />
    {byPassword && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Username')} aria-label={t('Username')} autoComplete="username" autoCapitalize="none" spellCheck={false}
        maxLength={32} value={login} onChange={e => setLogin(e.target.value)} />
      <div style={{ height: 10 }} />
      <input className="input" type="password" placeholder={t('Password (at least 8 characters)')} aria-label={t('Password')} autoComplete="new-password"
        maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
    </>}
    {!inviteOnly && <div className="dim small" style={{ marginTop: 8 }}>{t('This is the first account on this server — it will be the administrator.')}</div>}
    {inviteOnly && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Invite code')} aria-label={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only — enter the code you were given.')}</div>
    </>}
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={busy} onClick={go}>{byPassword ? t('Create profile') : t('Create passkey')}</Button>
    {passkeys && canPassword && <>
      <div style={{ height: 8 }} />
      <Button variant="ghost" onClick={() => setUsePassword(v => !v)}>
        {byPassword ? t('Use a passkey instead') : t('Use a username and password instead')}
      </Button>
    </>}
  </>
}

function PasswordSignIn({ primary = true, onDone }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async e => {
    e.preventDefault()
    if (!login.trim() || !password) { toast(t('Enter your username and password')); return }
    setBusy(true)
    try {
      const u = await passwordLogin(login.trim(), password)
      if (onDone) onDone()
      await arrive(u)
    } catch (err) {
      toast(err.message || t('Sign-in failed'))
      setBusy(false)
    }
  }
  return <form className="pw-form" onSubmit={submit}>
    <input className="input" placeholder={t('Username')} aria-label={t('Username')} autoComplete="username" autoCapitalize="none" spellCheck={false}
      value={login} onChange={e => setLogin(e.target.value)} />
    <input className="input" type="password" placeholder={t('Password')} aria-label={t('Password')} autoComplete="current-password"
      value={password} onChange={e => setPassword(e.target.value)} />
    <Button variant={primary ? 'primary' : 'plain'} icon="key" type="submit" disabled={busy}>{t('Sign in')}</Button>
  </form>
}

export function PasswordSignInSheet({ close }) {
  return <>
    <h3>{t('Sign in')}</h3>
    <PasswordSignIn onDone={close} />
  </>
}

export default function Login() {
  const setGuest = useStore(s => s.setGuest)
  const cfg = useAuthConfig()
  const passkeys = webauthnOK()
  const canPassword = !!cfg?.password_login
  const signIn = async () => {
    try { await arrive(await passkeyLogin()) }
    catch (e) { if (!cancelled(e)) toast(e.message || t('Sign-in failed')) }
  }
  const head = <>
    <div style={{ fontSize: 54, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="dumbbell" /></div>
    <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.028em', margin: '10px 0 4px' }}>WinterARC</h1>
  </>
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }

  // Demo build: no backend to sign in against — the only way in is the local guest profile.
  if (DEMO) return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 30 }}>{t('Live demo — everything stays in this browser.')}</div>
      <Button variant="primary" icon="sparkles" onClick={() => setGuest(true)}>{t('Start the demo')}</Button>
      <div className="card small muted" style={{ textAlign: 'left', marginTop: 16 }}>
        {t('This demo runs entirely in your browser on example data — nothing is sent anywhere. Passkey sign-in and sync across your devices come with the WinterARC server, which you get by self-hosting it.')}
      </div>
      <div className="dim small" style={{ marginTop: 22, lineHeight: 1.6 }}>
        <a href={REPO} target="_blank" rel="noopener">{t('Self-host it in a minute →')}</a>
      </div>
    </div>
  )

  return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 34 }}>{t('Your workouts. Your weights. Your profile.')}</div>
      {passkeys && <>
        <Button variant="primary" icon="person" onClick={signIn}>{t('Sign in with passkey')}</Button>
        <div style={{ height: 10 }} />
      </>}
      {canPassword && <>
        {passkeys && <div className="or" role="separator"><span>{t('or')}</span></div>}
        <PasswordSignIn primary={!passkeys} />
        <div style={{ height: 10 }} />
      </>}
      {(passkeys || canPassword) && <>
        <Button icon="sparkles" onClick={() => useUI.getState().openSheet(close => <RegisterSheet close={close} />)}>{t('Create new profile')}</Button>
        <div style={{ height: 10 }} />
      </>}
      {cfg && !passkeys && !canPassword && <div className="card small muted" style={{ textAlign: 'left' }}>
        {t("This browser doesn't support passkeys — you can still use WinterARC locally on this device.")}
      </div>}
      <Button variant="ghost" className="dim" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>
      <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>
        {!canPassword && <>{t('Passkeys use {0} — no passwords.', BIO)}<br /></>}
        {t('Each profile keeps its own plan, workouts & body weight.')}
      </div>
    </div>
  )
}
