// Thin wrapper around @capacitor-community/background-geolocation, only
// ever touched when running inside the native Android/iOS shell — this is
// what keeps GPS running while the phone is locked, which no website
// (including this one running in a normal mobile browser tab) can do.
import { Capacitor, registerPlugin } from '@capacitor/core'

// The plugin ships native (Android/Kotlin, iOS/Swift) code only — no JS
// entry point — so it's wired up via Capacitor's generic plugin registry
// rather than a normal import, per the plugin's own README.
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

// callback receives (lat, lng) on each fix; onError receives a status
// string ('denied' | 'unsupported'). Returns a watcher id to pass to
// stopWatching().
export async function startWatching(onLocation, onError) {
  return BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Sharing your location while clocked in.',
      backgroundTitle: 'Savvy Works — on shift',
      requestPermissions: true,
      stale: false,
      distanceFilter: 30, // metres between fixes — cuts battery use vs. reporting every GPS tick
    },
    (location, error) => {
      if (error) {
        if (error.code === 'NOT_AUTHORIZED') onError?.('denied')
        else onError?.('unsupported')
        return
      }
      if (location) onLocation(location.latitude, location.longitude)
    }
  )
}

export async function stopWatching(watcherId) {
  if (watcherId == null) return
  await BackgroundGeolocation.removeWatcher({ id: watcherId })
}
