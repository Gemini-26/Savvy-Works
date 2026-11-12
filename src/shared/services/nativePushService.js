// Alerts for the Android app while it is closed, delivered by Firebase Cloud
// Messaging. (Browsers use pushService.js; the app's web view has no Web Push.)
//
// Everything here is a no-op in a browser tab, and on a copy of the app built
// before the push plugin was added — the web code ships through Vercel ahead of
// any new APK, so it has to cope with a shell that cannot do this yet.
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../../lib/supabase'

const CHANNEL_ID = 'alerts'
// Urgent alerts (the automatic 17:00 clock-out) use their own channel so the
// phone treats them as the most important kind it knows: maximum importance
// means the sound plays and the card drops down over whatever is on screen.
// send-push names this channel for urgent notifications.
const URGENT_CHANNEL_ID = 'clock_out'
const TOKEN_KEY = 'savvy-device-token'
const REGISTER_TIMEOUT_MS = 15000

// True only inside the Android app, and only when its build includes the plugin.
export function nativePushReady() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications')
}

// 'default' (not asked yet) | 'granted' | 'denied' — same vocabulary the bell
// already uses for the browser's Notification.permission.
function toBellPermission(receive) {
  if (receive === 'granted') return 'granted'
  if (receive === 'denied') return 'denied'
  return 'default'
}

export async function nativePushPermission() {
  const { receive } = await PushNotifications.checkPermissions()
  return toBellPermission(receive)
}

function savedToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function rememberToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* private mode */ }
}

async function saveToken(token) {
  const { error } = await supabase.rpc('register_device_token', {
    p_token: token,
    p_platform: 'android',
    p_user_agent: navigator.userAgent.slice(0, 200),
  })
  if (error) throw error
  rememberToken(token)
}

// register() answers later through an event, so callers wait on this.
let waiting = []
function settle(result) {
  const resolvers = waiting
  waiting = []
  resolvers.forEach(resolve => resolve(result))
}

let listenersAdded = false
let openHandler = null

async function addListeners() {
  if (listenersAdded) return
  listenersAdded = true
  await PushNotifications.addListener('registration', async ({ value }) => {
    try { await saveToken(value); settle({ ok: true }) } catch (err) { settle({ error: err.message || 'save failed' }) }
  })
  await PushNotifications.addListener('registrationError', err => settle({ error: err?.error || 'registration failed' }))
  // Tapping the notification in the tray (app closed or in the background).
  await PushNotifications.addListener('pushNotificationActionPerformed', action => {
    openHandler?.(action.notification?.data?.link)
  })
}

function explain(error) {
  if (/FirebaseApp|google-services|MISSING_INSTANCEID/i.test(error)) {
    return 'This copy of the app was built without alert support. Install the latest version of the app, then try again.'
  }
  if (/SERVICE_NOT_AVAILABLE|timeout|TOO_MANY_REGISTRATIONS|network/i.test(error)) {
    return "This phone couldn't reach Google's messaging service. Check the internet connection, then try again."
  }
  return `Could not finish setting up alerts for a closed app (${error}).`
}

// Registers this phone for the signed-in person. Safe on every launch: the token
// can change, and re-saving also hands the phone to whoever signed in last.
// Resolves to '' when it is set up, otherwise a sentence saying what went wrong.
export async function setUpNativePush(onOpen) {
  if (!nativePushReady()) return ''
  openHandler = onOpen
  try {
    await addListeners()
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Job alerts',
      description: 'New jobs, job updates and other things that need you',
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
    })
    await PushNotifications.createChannel({
      id: URGENT_CHANNEL_ID,
      name: 'Clock-out alarm',
      description: 'The loud alert when you are clocked out automatically at 17:00',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    })
    const result = await new Promise(resolve => {
      waiting.push(resolve)
      setTimeout(() => settle({ error: 'timeout' }), REGISTER_TIMEOUT_MS)
      PushNotifications.register().catch(err => settle({ error: err?.message || 'register failed' }))
    })
    return result.ok ? '' : explain(result.error)
  } catch (err) {
    return explain(err?.message || 'unknown error')
  }
}

// Asks Android for permission (must come from a tap) and registers the phone.
// Resolves to { permission, problem } like pushService.enableAlerts.
export async function enableNativeAlerts(onOpen) {
  const { receive } = await PushNotifications.requestPermissions()
  const permission = toBellPermission(receive)
  const problem = permission === 'granted' ? await setUpNativePush(onOpen) : ''
  return { permission, problem }
}

// On sign-out: this phone stops being the signed-out person's.
export async function forgetNativeToken() {
  const token = savedToken()
  if (!token) return
  await supabase.from('device_tokens').delete().eq('token', token)
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
}
