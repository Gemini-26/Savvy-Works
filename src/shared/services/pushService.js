import { supabase } from '../../lib/supabase'

// Public half of the Web Push key pair (the private half lives only in the
// send-push function's secrets). Without it, pop-ups still work while the app
// is open, but nothing can reach a closed one.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function canShowSystemNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function pushConfigured() {
  return !!VAPID_PUBLIC_KEY
}

function pushSupported() {
  return pushConfigured() && 'serviceWorker' in navigator && 'PushManager' in window && canShowSystemNotifications()
}

// 'default' (not asked yet) | 'granted' | 'denied' | 'unsupported' — the Android
// app's web view has no Notification API at all.
export function notificationPermission() {
  return canShowSystemNotifications() ? Notification.permission : 'unsupported'
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

// `serviceWorker.ready` never settles when no worker is registered (the dev
// server, an unsupported browser), so give up after a moment.
async function readyRegistration() {
  if (!('serviceWorker' in navigator)) return null
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise(resolve => setTimeout(() => resolve(null), 4000)),
  ])
}

// Makes sure this browser has a push address on file for the signed-in person.
// Safe to call on every load: it re-saves the address, which also hands the
// browser over to whoever signed in on it last.
export async function syncPushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await readyRegistration()
  if (!reg) throw Object.assign(new Error('The background worker is not ready'), { name: 'WorkerNotReady' })

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  })
  if (error) throw error
  return true
}

// Brave ships with Google's push service switched off, which makes subscribing
// fail with a bare "push service error" — say what to flip rather than leave
// staff wondering why a closed app stays silent.
async function explainPushFailure(err) {
  const isBrave = !!(navigator.brave && await navigator.brave.isBrave().catch(() => false))
  if (err?.name === 'AbortError' || /push service/i.test(err?.message || '')) {
    return isBrave
      ? 'Brave blocks alerts for a closed app by default. Open brave://settings/privacy, turn on "Use Google services for push messaging", restart Brave, then try again.'
      : 'This browser could not reach its push service, so alerts for a closed app cannot be set up. Check the internet connection or firewall, then try again.'
  }
  if (err?.name === 'WorkerNotReady') {
    return 'The app is still setting itself up in the background. Reload the page and try again.'
  }
  if (err?.name === 'NotAllowedError') {
    return 'Notifications are blocked for this site. Allow them from the padlock beside the address bar, then try again.'
  }
  return `Could not finish setting up alerts for a closed app${err?.message ? ` (${err.message})` : ''}.`
}

// Signs this device up for closed-app alerts. Resolves to '' when it is set up,
// otherwise to a sentence saying what went wrong.
export async function setUpPush() {
  try {
    await syncPushSubscription()
    return ''
  } catch (err) {
    return explainPushFailure(err)
  }
}

// Asks the browser for permission (must come from a tap) and, when push is
// configured, signs this device up for it. Resolves to { permission, problem }.
export async function enableAlerts() {
  if (!canShowSystemNotifications()) return { permission: 'unsupported', problem: '' }
  const permission = await Notification.requestPermission()
  const problem = permission === 'granted' ? await setUpPush() : ''
  return { permission, problem }
}

// A pop-up from the open page, for when its tab is in the background. The
// service worker shows it when there is one (the only way on phones); the tag
// is the notification's id, so the copy the server pushes replaces this one
// instead of stacking beside it.
export async function showSystemNotification({ id, title, body, link }, onClick) {
  if (notificationPermission() !== 'granted') return
  const options = {
    body: body || '',
    tag: `n-${id}`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    data: { link },
  }
  const reg = await readyRegistration()
  if (reg) { await reg.showNotification(title, options); return }
  const shown = new Notification(title, options)
  shown.onclick = () => { window.focus(); shown.close(); onClick?.() }
}

// Lets the server push this batch of notifications to people's devices.
// Fire-and-forget: the in-app copy is already saved, so a failed push must
// never fail the action that created it.
export async function pushNotifications(ids) {
  if (!pushConfigured() || !ids?.length) return
  try {
    await supabase.functions.invoke('send-push', { body: { notification_ids: ids } })
  } catch { /* the bell still has it */ }
}
