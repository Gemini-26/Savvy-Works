import { useEffect, useRef, useState } from 'react'
import { updateShiftLocation } from '../shared/services/workShiftService'
import { isNativeApp, startWatching, stopWatching } from '../shared/services/nativeBackgroundLocation'
import { checkPermissions, onPermissionsChanged, requestNotificationPermission } from '../shared/services/nativePermissions'

const PING_MS = 45000
const RETRY_MS = 15000
const STORAGE_KEY = 'locationSharingEnabled'

function readStoredPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeStoredPreference(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // storage unavailable — preference just won't persist across reloads
  }
}

// Explicit opt-in location sharing while clocked in. Nothing runs until the
// technician flips the toggle on — this is what actually triggers the
// browser's native permission prompt. `status` reflects what happened:
//   off | requesting | granted | reconnecting | denied | unsupported
//
// `backgroundReady` is the native-app-only follow-up question: tracking is
// running, but will it survive the screen locking? That needs Android's
// separate "Allow all the time" grant, which is requested from the Background
// Access card on the Profile screen (it has to be preceded by a disclosure
// screen, so it deliberately does not happen behind this toggle).
//
// Mobile browsers pause watchPosition (and release any Wake Lock) the
// moment the tab goes into the background — phone locked, another app in
// front, screen timeout. There's no way to keep GPS running through that
// from a website; the best a browser-based tracker can do is (a) hold the
// screen awake while the tab IS in the foreground, and (b) immediately
// re-arm tracking the instant the tab becomes visible again, so coverage
// gaps are limited to "phone was locked / app was backgrounded", not
// "tracking silently died and needs a manual reload".
export function useLocationTracking(shiftId) {
  const [enabled, setEnabled] = useState(readStoredPreference)
  const [status, setStatus] = useState('off')
  const [backgroundReady, setBackgroundReady] = useState(true)
  const lastSentAt = useRef(0)
  const watchIdRef = useRef(null)
  const wakeLockRef = useRef(null)

  // Reflect the browser's actual permission state up front (without
  // triggering a prompt) so a previously-blocked toggle shows as blocked
  // instead of silently doing nothing when flipped on.
  useEffect(() => {
    if (!('permissions' in navigator)) return
    navigator.permissions?.query?.({ name: 'geolocation' })
      .then(result => {
        if (result.state === 'denied' && enabled) setStatus('denied')
        result.onchange = () => {
          if (result.state === 'denied') setStatus('denied')
        }
      })
      .catch(() => {})
  }, [enabled])

  // Inside the native app shell (Capacitor), a background-geolocation
  // plugin keeps a foreground service alive so GPS keeps reporting even
  // with the phone fully locked — the one thing the browser path can never
  // do. This branch replaces watchPosition/Wake Lock/visibilitychange
  // entirely when running natively; the plugin handles all of that itself.
  useEffect(() => {
    if (!isNativeApp()) return
    if (!shiftId || !enabled) {
      setStatus('off')
      return
    }

    let cancelled = false
    let watcherId = null

    // The plugin reports a fix every `distanceFilter` metres, which while
    // driving is every couple of seconds — far more often than the live map
    // needs, and a write to work_shifts each time. Collapse them to one write
    // per PING_MS, always keeping the newest fix, and hold onto a fix that
    // failed to send rather than dropping the technician off the map because
    // they drove through a dead spot.
    let lastSent = 0
    let pending = null
    let timer = null

    function schedule(delay) {
      if (timer != null || cancelled) return
      timer = setTimeout(() => {
        timer = null
        flush()
      }, delay)
    }

    function flush() {
      if (cancelled || !pending) return
      const fix = pending
      pending = null
      lastSent = Date.now()
      updateShiftLocation(shiftId, fix.lat, fix.lng).catch(() => {
        if (cancelled) return
        // Offline or the request lost the race with the phone sleeping —
        // put the fix back unless a newer one has already landed.
        pending = pending || fix
        schedule(RETRY_MS)
      })
    }

    function report(lat, lng) {
      if (cancelled) return
      setStatus('granted')
      pending = { lat, lng }
      const wait = PING_MS - (Date.now() - lastSent)
      if (wait <= 0) flush()
      else schedule(wait)
    }

    setStatus('requesting')

    async function start() {
      // Android 13+ won't show the ongoing "on shift" notification without
      // this, and a foreground service with no visible notification is one the
      // system feels free to kill. Asked for first so the service has it by
      // the time it starts.
      await requestNotificationPermission()
      if (cancelled) return

      const id = await startWatching(report, reason => {
        if (!cancelled) setStatus(reason)
      })
      if (cancelled) {
        stopWatching(id)
        return
      }
      watcherId = id

      // Tracking is up — but "Allow all the time" is a second grant the plugin
      // never asks for, and without it everything above stops the moment the
      // screen locks. Surface that rather than letting it fail silently.
      const perms = await checkPermissions()
      if (!cancelled && perms) setBackgroundReady(perms.backgroundLocation === 'granted')
    }

    start().catch(() => {
      if (!cancelled) setStatus('denied')
    })

    // The grant can land later, from the Background Access card or the phone's
    // settings app — pick it up without needing the toggle flipped again.
    const unsubscribe = onPermissionsChanged(next => {
      if (!cancelled) setBackgroundReady(next.backgroundLocation === 'granted')
    })

    return () => {
      cancelled = true
      unsubscribe()
      if (timer != null) clearTimeout(timer)
      if (watcherId != null) stopWatching(watcherId)
    }
  }, [shiftId, enabled])

  useEffect(() => {
    if (isNativeApp()) return // handled by the native effect above
    if (!shiftId || !enabled) {
      setStatus('off')
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }

    let cancelled = false
    let sawFirstFix = false

    function handlePosition(pos) {
      if (cancelled) return
      sawFirstFix = true
      setStatus('granted')
      const now = Date.now()
      if (now - lastSentAt.current < PING_MS) return
      lastSentAt.current = now
      updateShiftLocation(shiftId, pos.coords.latitude, pos.coords.longitude).catch(() => {})
    }

    function handleError(err) {
      if (cancelled) return
      if (err?.code === err?.PERMISSION_DENIED) {
        setStatus('denied')
        return
      }
      // Timeout / position-unavailable is transient — watchPosition keeps
      // retrying on its own, this is not a permanent failure.
      setStatus(sawFirstFix ? 'reconnecting' : 'requesting')
    }

    function startWatch() {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      lastSentAt.current = 0 // force a fresh ping once we're back
      watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: false,
        maximumAge: 30000,
        timeout: 20000,
      })
    }

    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch {
        // Not available/allowed (e.g. battery saver, unsupported browser) —
        // tracking still runs, the screen just may sleep sooner.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      // The tab was backgrounded and is now back — the watch and wake lock
      // were almost certainly silently dropped by the browser, so re-arm both.
      setStatus(sawFirstFix ? 'reconnecting' : 'requesting')
      startWatch()
      requestWakeLock()
    }

    startWatch()
    requestWakeLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      wakeLockRef.current?.release?.().catch(() => {})
      wakeLockRef.current = null
    }
  }, [shiftId, enabled])

  function toggle(next) {
    setEnabled(next)
    writeStoredPreference(next)
    if (!next) setStatus('off')
  }

  return { enabled, status, toggle, backgroundReady, isNative: isNativeApp() }
}
