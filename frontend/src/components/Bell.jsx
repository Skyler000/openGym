import { useNavigate } from 'react-router-dom'
import { useNotes } from '../lib/notifications.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// The header bell: opens the notification feed and shows how many are unread.
export default function Bell() {
  const nav = useNavigate()
  const unread = useNotes(s => s.unread)
  return <button className="iconbtn bell" onClick={() => nav('/notifications')}
    aria-label={unread ? t('Notifications, {0} unread', unread) : t('Notifications')}>
    <Icon name="bell" />
    {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
  </button>
}
