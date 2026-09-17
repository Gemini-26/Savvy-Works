import { useCallback, useEffect, useState } from 'react'
import {
  checkPermissions,
  isNativeApp,
  onPermissionsChanged,
  openAppSettings,
  openLocationSettings,
  requestBackgroundLocationFlow,
  requestBatteryExemption,
  requestNotificationPermission,
} from '../shared/services/nativePermissions'

// OEMs that add their own app-killer on top of stock Android — on these, the
// battery-optimisation exemption alone often isn't enough and there's a second
// switch buried in the manufacturer's own settings.
const EXTRA_AGGRESSIVE = {
  samsung: 'Settings → Battery → Background usage limits → make sure Savvy Works is NOT in "Sleeping apps", and add it to "Never sleeping apps".',
  xiaomi: 'Settings → Apps → Savvy Works → set Battery saver to "No restrictions", and turn on Autostart.',
  redmi: 'Settings → Apps → Savvy Works → set Battery saver to "No restrictions", and turn on Autostart.',
  poco: 'Settings → Apps → Savvy Works → set Battery saver to "No restrictions", and turn on Autostart.',
  huawei: 'Settings → Battery → App launch → switch Savvy Works to Manage manually and turn all three switches on.',
  honor: 'Settings → Battery → App launch → switch Savvy Works to Manage manually and turn all three switches on.',
  oppo: 'Settings → Battery → Savvy Works → allow background running and enable Auto-start.',
  realme: 'Settings → Battery → Savvy Works → allow background running and enable Auto-start.',
  vivo: 'Settings → Battery → High background power consumption → allow Savvy Works, and enable Auto-start.',
  oneplus: 'Settings → Battery → Battery optimisation → Savvy Works → Don’t optimise, and disable "Deep optimisation".',
}

// Native-only permission state for the background-capable parts of the app.
// On the web everything reports `supported: false` and the UI hides itself —
// a browser tab simply cannot hold these permissions.
export function useAppPermissions() {
  const supported = isNativeApp()
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(null)

  const refresh = useCallback(() => {
    if (!supported) return Promise.resolve(null)
    return checkPermissions().then(next => {
      if (next) setStatus(next)
      return next
    })
  }, [supported])

  useEffect(() => {
    if (!supported) return
    refresh()
    // The native side re-broadcasts on resume, which covers the round trip out
    // to the Settings app and back.
    return onPermissionsChanged(next => setStatus(next))
  }, [supported, refresh])

  // Wrap each request so only one runs at a time and the panel always ends up
  // showing the real post-request state, however the user answered.
  const run = useCallback((key, fn) => async () => {
    setBusy(key)
    try {
      const next = await fn()
      if (next) setStatus(next)
      else await refresh()
    } finally {
      setBusy(null)
    }
  }, [refresh])

  const manufacturer = (status?.manufacturer || '').toLowerCase()
  const oemHint = Object.keys(EXTRA_AGGRESSIVE).find(k => manufacturer.includes(k))

  return {
    supported,
    status,
    busy,
    refresh,
    // Every action resolves with the refreshed status, so the panel updates
    // itself without the caller having to re-check.
    requestBackgroundLocation: run('backgroundLocation', requestBackgroundLocationFlow),
    requestNotifications: run('notifications', requestNotificationPermission),
    requestBattery: run('battery', requestBatteryExemption),
    openSettings: run('settings', openAppSettings),
    openLocationSettings: run('locationSettings', openLocationSettings),
    oemHint: oemHint ? EXTRA_AGGRESSIVE[oemHint] : null,
    // True once GPS can actually keep reporting with the phone locked: the
    // "all the time" grant, a notification to show the ongoing service, and no
    // battery manager waiting to freeze it.
    backgroundLocationReady:
      status?.backgroundLocation === 'granted' &&
      status?.notifications === 'granted' &&
      status?.batteryUnrestricted === true,
  }
}
