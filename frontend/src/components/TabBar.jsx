import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { isSuperAdmin, isCoach, isActive } from '../lib/roles.js'
import Icon from './Icon.jsx'

// One bar per role. A paused account gets no bar at all: the lock screen is the whole app for it.
export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  if (!user && !isGuest) return null
  if (!isActive(user)) return null
  const path = loc.pathname
  const cur = path.split('/')[1] || 'home'

  const Tab = ({ on, icon, to, label }) => (
    <button className={on ? 'on' : ''} onClick={() => nav(to)}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  )

  if (isSuperAdmin(user)) return (
    <nav id="tabbar">
      <Tab on={path === '/sa' || cur === 'notifications'} icon="chart" to="/sa" label="Dashboard" />
      <Tab on={path.startsWith('/sa/coach')} icon="users" to="/sa/coaches" label="Coaches" />
      <Tab on={cur === 'settings'} icon="gear" to="/settings" label={t('Settings')} />
    </nav>
  )

  if (isCoach(user)) return (
    <nav id="tabbar">
      <Tab on={path === '/c' || cur === 'notifications'} icon="chart" to="/c" label="Dashboard" />
      <Tab on={path.startsWith('/c/client')} icon="users" to="/c/clients" label="Clients" />
      <Tab on={path.startsWith('/c/plan')} icon="clipboard" to="/c/plans" label="Plans" />
      <Tab on={cur === 'settings'} icon="gear" to="/settings" label={t('Settings')} />
    </nav>
  )

  // A coached client trades the Exercises tab for their coach; the library stays one tap away on Plan.
  const coached = user?.role === 'client' && !!user.coachId
  const on = k => cur === k || (cur === 'history' && k === 'stats') || ((cur === 'settings' || cur === 'notifications') && k === 'home') ||
    (cur === 'progress' && k === (coached ? 'coach' : 'stats')) || (coached && cur === 'library' && k === 'plan')

  const startWorkout = () => {
    if (!S.active) {
      const r = effectiveRoutine(S, todayISO())
      if (r && r.ex.length) { onStart(r.id); return }
    }
    nav('/workout')
  }

  return (
    <nav id="tabbar">
      <Tab on={on('home')} icon="house" to="/home" label={t('Home')} />
      <Tab on={on('plan')} icon="calendar" to="/plan" label={t('Plan')} />
      <button className={'start' + (S.active ? ' rec' : '')} onClick={startWorkout}>
        <span className="cir"><Icon name={S.active ? 'play' : 'dumbbell'} /></span>
        <span>{S.active ? t('Resume') : t('Start')}</span>
      </button>
      <Tab on={on('stats')} icon="chart" to="/stats" label={t('Stats')} />
      {coached
        ? <Tab on={on('coach')} icon="personCircle" to="/coach" label={t('Coach')} />
        : <Tab on={on('library')} icon="list" to="/library" label={t('Exercises')} />}
    </nav>
  )
}
