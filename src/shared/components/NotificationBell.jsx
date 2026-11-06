import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, Volume2, VolumeX } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { fetchMyNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead } from '../services/notificationService'
import { enableAlerts, notificationPermission, setUpPush, showSystemNotification } from '../services/pushService'
import { installSoundUnlock, isSoundOn, playNotificationSound, setSoundOn, unlockSound } from '../utils/notificationSound'
import { formatDateRelative, formatTime } from '../utils/formatDate'
import NotificationToasts from './NotificationToasts'

const POLL_MS = 30000
const MAX_TOASTS = 4
const PROMPT_KEY = 'savvy-alert-prompt-done'
const PROMPT_ID = 'enable-alerts-prompt'

function promptAlreadyAnswered() {
  try { return localStorage.getItem(PROMPT_KEY) === '1' } catch { return true }
}

function rememberPromptAnswered() {
  try { localStorage.setItem(PROMPT_KEY, '1') } catch { /* private mode */ }
}

export default function NotificationBell() {
  const { profile } = useCurrentUser()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [toasts, setToasts] = useState([])
  const [soundOn, setSoundOnState] = useState(isSoundOn)
  const [permission, setPermission] = useState(notificationPermission)
  // Why alerts for a closed app aren't set up on this device ('' when they are).
  const [pushProblem, setPushProblem] = useState('')
  // Ids already announced, so a row that arrives live and then again on the
  // next refresh only makes a noise once.
  const seen = useRef(new Set())
  // react-router hands back a new navigate() on every route change; the live
  // subscription below must not be torn down and rebuilt each time, so the
  // callbacks reach it through a ref.
  const navigateRef = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }, [navigate])

  useEffect(() => installSoundUnlock(), [])

  const dismissToast = useCallback(id => {
    if (id === PROMPT_ID) rememberPromptAnswered()
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const openLink = useCallback(link => {
    if (link && link.startsWith('/')) navigateRef.current(link)
  }, [])

  // New unread notifications: chime, an on-screen card, and — if this tab is
  // in the background — a system pop-up in the notification bar.
  const announce = useCallback(rows => {
    const fresh = rows.filter(r => !seen.current.has(r.id))
    fresh.forEach(r => seen.current.add(r.id))
    const unreadFresh = fresh.filter(r => !r.is_read)
    if (unreadFresh.length === 0) return

    playNotificationSound()
    const shown = unreadFresh.slice(0, 3)
    setToasts(prev => [
      ...shown.map(r => ({ id: r.id, kind: 'notification', title: r.title, body: r.body, link: r.link })),
      ...prev,
    ].slice(0, MAX_TOASTS))
    if (document.hidden) {
      shown.forEach(r => showSystemNotification(r, () => openLink(r.link)).catch(() => {}))
    }
  }, [openLink])

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    let primed = false
    seen.current = new Set()

    async function refresh() {
      try {
        const [list, count] = await Promise.all([fetchMyNotifications(profile.id), fetchUnreadCount(profile.id)])
        if (cancelled) return
        setNotifications(list)
        setUnread(count)
        // The first load is history, not news.
        if (!primed) { list.forEach(r => seen.current.add(r.id)); primed = true } else announce(list)
      } catch { /* try again on the next poll */ }
    }
    refresh()

    // Live: the moment a row is written for this person. The poll below is the
    // safety net for a dropped connection.
    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        payload => { announce([payload.new]); refresh() },
      )
      .subscribe()

    const interval = setInterval(refresh, POLL_MS)
    function onVisible() { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [profile?.id, announce])

  // Re-saves this browser's push address for whoever is signed in on it.
  useEffect(() => {
    if (profile?.id && notificationPermission() === 'granted') setUpPush().then(setPushProblem)
  }, [profile?.id])

  // Tapping a system pop-up while the app is already open comes back here.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function onMessage(e) {
      if (e.data?.type === 'open-link') openLink(e.data.link)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [openLink])

  async function turnOnAlerts() {
    unlockSound()
    const { permission: result, problem } = await enableAlerts()
    setPermission(result)
    setPushProblem(problem)
    // The offer card closes itself once answered, so a failure needs its own card.
    if (problem) {
      setToasts(prev => [{ id: 'alerts-problem', kind: 'notice', title: 'Closed-app alerts are not set up', body: problem }, ...prev.filter(t => t.id !== 'alerts-problem')].slice(0, MAX_TOASTS))
    }
  }

  async function retryPush(e) {
    e.stopPropagation()
    setPushProblem(await setUpPush())
  }

  // One gentle, one-time offer to turn pop-ups on (browsers only allow asking
  // from a tap, so this is a button, not an automatic prompt).
  useEffect(() => {
    if (!profile?.id || notificationPermission() !== 'default' || promptAlreadyAnswered()) return
    const timer = setTimeout(() => {
      setToasts(prev => prev.some(t => t.id === PROMPT_ID) ? prev : [
        {
          id: PROMPT_ID,
          kind: 'prompt',
          onAccept: async () => { await turnOnAlerts(); dismissToast(PROMPT_ID) },
        },
        ...prev,
      ])
    }, 4000)
    return () => clearTimeout(timer)
  }, [profile?.id, dismissToast])

  async function toggleOpen(e) {
    e.stopPropagation()
    const next = !open
    setOpen(next)
    if (next && profile?.id) {
      const data = await fetchMyNotifications(profile.id).catch(() => [])
      setNotifications(data)
    }
  }

  async function openNotification(n) {
    dismissToast(n.id)
    if (!n.is_read) {
      await markNotificationRead(n.id).catch(() => {})
      setUnread(u => Math.max(0, u - 1))
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    setOpen(false)
    openLink(n.link)
  }

  async function handleMarkAllRead(e) {
    e.stopPropagation()
    if (!profile?.id) return
    await markAllNotificationsRead(profile.id).catch(() => {})
    setUnread(0)
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })))
  }

  function toggleSound(e) {
    e.stopPropagation()
    const next = !soundOn
    setSoundOn(next)
    setSoundOnState(next)
    if (next) {
      unlockSound()
      playNotificationSound({ force: true })
    }
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

      <NotificationToasts
        toasts={toasts}
        onOpen={t => openNotification({ id: t.id, link: t.link, is_read: false })}
        onDismiss={dismissToast}
      />

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
                  onClick={() => openNotification(n)}
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

          <div className="sticky bottom-0 bg-white border-t border-gray-100">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button onClick={toggleSound} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900">
                {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
                Sound {soundOn ? 'on' : 'off'}
              </button>
              {permission === 'default' && (
                <button onClick={turnOnAlerts} className="text-xs text-blue-600 font-medium hover:underline">
                  Turn on pop-up alerts
                </button>
              )}
              {permission === 'granted' && !pushProblem && (
                <span className="flex items-center gap-1 text-xs text-green-600"><Check size={12} /> Pop-up alerts on</span>
              )}
              {permission === 'granted' && pushProblem && (
                <span className="text-xs text-amber-600 font-medium">Closed-app alerts off</span>
              )}
              {permission === 'denied' && (
                <span className="text-xs text-gray-400">Pop-ups blocked in browser settings</span>
              )}
            </div>
            {permission === 'granted' && pushProblem && (
              <div className="px-3 pb-2">
                <p className="text-[11px] text-gray-600">{pushProblem}</p>
                <button onClick={retryPush} className="mt-1 text-xs text-blue-600 font-medium hover:underline">Try again</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
