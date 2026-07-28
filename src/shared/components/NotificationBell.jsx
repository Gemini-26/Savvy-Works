import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { fetchMyNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead } from '../services/notificationService'
import { formatDateRelative, formatTime } from '../utils/formatDate'

export default function NotificationBell() {
  const { profile } = useCurrentUser()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!profile?.id) return
    fetchUnreadCount(profile.id).then(setUnread).catch(() => {})
    const interval = setInterval(() => {
      fetchUnreadCount(profile.id).then(setUnread).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [profile?.id])

  async function toggleOpen(e) {
    e.stopPropagation()
    const next = !open
    setOpen(next)
    if (next && profile?.id) {
      const data = await fetchMyNotifications(profile.id).catch(() => [])
      setNotifications(data)
    }
  }

  async function handleClick(n) {
    if (!n.is_read) {
      await markNotificationRead(n.id).catch(() => {})
      setUnread(u => Math.max(0, u - 1))
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  async function handleMarkAllRead(e) {
    e.stopPropagation()
    if (!profile?.id) return
    await markAllNotificationsRead(profile.id).catch(() => {})
    setUnread(0)
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })))
  }

  return (
    <div className="relative">
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={toggleOpen}
        className="relative p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          onPointerDown={e => e.stopPropagation()}
          className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-50"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-800">Notifications</p>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-blue-600 font-medium hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No notifications yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />}
                    <div className={!n.is_read ? '' : 'pl-3.5'}>
                      <p className="text-sm font-medium text-gray-800">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                      <p className="text-[11px] text-gray-400 mt-1">{formatDateRelative(n.created_at)}, {formatTime(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
