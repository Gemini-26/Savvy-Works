import { useEffect, useRef, useState } from 'react'
import { updateShiftLocation } from '../shared/services/workShiftService'

const PING_MS = 45000
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
//   off | requesting | granted | denied | unsupported
export function useLocationTracking(shiftId) {
  const [enabled, setEnabled] = useState(readStoredPreference)
  const [status, setStatus] = useState('off')
  const lastSentAt = useRef(0)
  const watchIdRef = useRef(null)

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

  useEffect(() => {
    if (!shiftId || !enabled) {
      setStatus(enabled ? 'off' : 'off')
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }

    setStatus('requesting')

    function handlePosition(pos) {
      setStatus('granted')
      const now = Date.now()
      if (now - lastSentAt.current < PING_MS) return
      lastSentAt.current = now
      updateShiftLocation(shiftId, pos.coords.latitude, pos.coords.longitude).catch(() => {})
    }

    function handleError(err) {
      setStatus(err?.code === err?.PERMISSION_DENIED ? 'denied' : 'unsupported')
    }

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: false,
      maximumAge: 30000,
      timeout: 20000,
    })

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [shiftId, enabled])

  function toggle(next) {
    setEnabled(next)
    writeStoredPreference(next)
    if (!next) setStatus('off')
  }

  return { enabled, status, toggle }
}
