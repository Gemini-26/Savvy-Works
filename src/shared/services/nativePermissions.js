// Runtime permissions for the native Android shell — the ones that decide
// whether the app can still do its job once it is off screen.
//
// Pairs with android/app/src/main/java/com/savvycivils/works/AppPermissionsPlugin.java.
// Everything here is a no-op returning `null` in a normal browser tab, so the
// same components can render on the web without branching.
import { Capacitor, registerPlugin } from '@capacitor/core'

const AppPermissions = registerPlugin('AppPermissions')

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

// Shape of a status object (all permission fields are one of
// 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'):
//   { sdkInt, manufacturer, location, backgroundLocation, notifications,
//     batteryUnrestricted, locationServicesEnabled }
//
// 'prompt' means never asked — a prompt will work. 'denied' means asked and
// refused, and on Android that is final: only the Settings app can undo it,
// which is why every caller has an "open settings" escape hatch.
async function callPlugin(method, fallback = null) {
  if (!isNativeApp()) return fallback
  try {
    return await AppPermissions[method]()
  } catch {
    // A missing/failed plugin call shouldn't take a screen down with it —
    // the UI treats a null status as "can't tell, hide the panel".
    return fallback
  }
}

export function checkPermissions() {
  return callPlugin('check')
}

export function requestLocationPermission() {
  return callPlugin('requestLocation')
}

export function requestBackgroundLocationPermission() {
  return callPlugin('requestBackgroundLocation')
}

export function requestNotificationPermission() {
  return callPlugin('requestNotifications')
}

export function requestBatteryExemption() {
  return callPlugin('requestIgnoreBatteryOptimizations')
}

export function openAppSettings() {
  return callPlugin('openAppSettings')
}

export function openLocationSettings() {
  return callPlugin('openLocationSettings')
}

// Android refuses to grant "Allow all the time" in the same prompt as the
// ordinary location permission (11+), so this is deliberately two round trips:
// ask for while-using first, and only then for the background upgrade. Returns
// the final status so the caller can see how far it actually got.
export async function requestBackgroundLocationFlow() {
  const afterForeground = await requestLocationPermission()
  if (!afterForeground || afterForeground.location !== 'granted') return afterForeground
  if (afterForeground.backgroundLocation === 'granted') return afterForeground
  return requestBackgroundLocationPermission()
}

// The plugin re-broadcasts permissions every time the app is resumed, which is
// how we find out what the user did while they were away in the Settings app.
export function onPermissionsChanged(callback) {
  if (!isNativeApp()) return () => {}
  let handle = null
  let cancelled = false
  AppPermissions.addListener('permissionsChanged', callback)
    .then(h => {
      if (cancelled) h.remove()
      else handle = h
    })
    .catch(() => {})
  return () => {
    cancelled = true
    handle?.remove?.()
  }
}
