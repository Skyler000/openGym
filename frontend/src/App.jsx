import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { useWakeLock } from './lib/wakelock.js'
import { startFlow } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import Logo from './components/Logo.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login from './views/Login.jsx'
import Home from './views/Home.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Settings from './views/Settings.jsx'
import Lock from './views/Lock.jsx'
import SACoaches from './views/sa/Coaches.jsx'
import SACoachDetail from './views/sa/CoachDetail.jsx'
import CoachClients from './views/coach/Clients.jsx'
import CoachClientDetail from './views/coach/ClientDetail.jsx'
import CoachPlans from './views/coach/Plans.jsx'
import PlanBuilder from './views/coach/PlanBuilder.jsx'
import CoachHub from './views/client/CoachHub.jsx'
import Progress from './views/client/Progress.jsx'
import SADashboard from './views/sa/Dashboard.jsx'
import CoachDashboard from './views/coach/Dashboard.jsx'
import Notifications from './views/Notifications.jsx'
import { startNotificationPolling } from './lib/notifications.js'
import { startLive } from './lib/events.js'
import { startChatBadge } from './lib/chat.js'
import { syncPushSubscription } from './lib/push.js'
import Conversation from './views/chat/Conversation.jsx'
import Inbox from './views/chat/Inbox.jsx'
import SAAnalytics from './views/sa/Analytics.jsx'
import CoachAnalytics from './views/coach/Analytics.jsx'
import { isSuperAdmin, isCoach, isClient, isActive, homeRoute } from './lib/roles.js'

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

function applyPrefs(theme, accent) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f2f2f7' : '#000000'
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready } = useStore()
  const isGuest = useStore(s => s.isGuest())
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs(S.theme, S.accent) }, [S.theme, S.accent])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // Coaches and the super admin land on their own home rather than the client tracker.
  useEffect(() => {
    if ((isSuperAdmin(user) || isCoach(user)) && (loc.pathname === '/' || loc.pathname === '/home')) navigate(homeRoute(user), { replace: true })
  }, [user?.role])
  // The bell's unread count, for any signed-in account — a paused one included: "your access is
  // back" arrives as a notification, and re-reading who we are then lifts the lock screen by itself.
  useEffect(() => {
    if (!user?.id) return
    return startNotificationPolling(() => useStore.getState().refreshMe())
  }, [user?.id])
  // The live stream serves any signed-in account; the chat badge only one that can chat right now.
  useEffect(() => {
    if (!user?.id) return
    return startLive()
  }, [user?.id])
  // Alerts on this device go to whoever is signed in on it now.
  useEffect(() => { if (user?.id) syncPushSubscription() }, [user?.id])
  const canChat = (isCoach(user) || isClient(user)) && isActive(user)
  useEffect(() => {
    if (!user?.id || !canChat) return
    return startChatBadge()
  }, [user?.id, canChat])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)

  const authed = user || isGuest
  if (!ready && !authed) return (
    <div id="app">
      <div className="boot-splash" style={{ paddingTop: '42vh', display: 'flex', justifyContent: 'center' }}>
        <Logo size={76} />
      </div>
    </div>
  )

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
      <div id="app" className="vfade" key={loc.pathname}>
        <ErrorBoundary>
          {/* A paused account keeps its sign-in but sees only the lock screen, which explains why. */}
          {!authed ? <Login /> : !isActive(user) ? <Lock /> : (
            <Routes>
              {isSuperAdmin(user) && <>
                <Route path="/sa" element={<SADashboard />} />
                <Route path="/sa/coaches" element={<SACoaches />} />
                <Route path="/sa/analytics" element={<SAAnalytics />} />
                <Route path="/sa/coach/:id" element={<SACoachDetail />} />
              </>}
              {isCoach(user) && <>
                <Route path="/c" element={<CoachDashboard />} />
                <Route path="/c/clients" element={<CoachClients />} />
                <Route path="/c/chat" element={<Inbox />} />
                <Route path="/c/analytics" element={<CoachAnalytics />} />
                <Route path="/c/client/:id" element={<CoachClientDetail />} />
                <Route path="/c/plans" element={<CoachPlans />} />
                <Route path="/c/plan/:id" element={<PlanBuilder />} />
              </>}
              {isClient(user) && <Route path="/coach" element={<CoachHub />} />}
              {(isCoach(user) || isClient(user)) && <Route path="/chat/:peer" element={<Conversation />} />}
              <Route path="/home" element={<Home />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to={homeRoute(user)} replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      <TabBar onStart={startFlow} />
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return <HashRouter><Shell /></HashRouter>
}
