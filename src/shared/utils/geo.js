// Great-circle distance in metres between two { lat, lng } points. The same
// formula the database uses to judge a clock-in (geo_distance_m), kept here
// for showing distances on screen.
export function distanceMeters(a, b) {
  const R = 6371000
  const rad = d => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(meters) {
  if (meters == null) return ''
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

// One fresh GPS reading, resolving to { lat, lng, accuracy } (accuracy in
// metres) or null when location is denied, switched off or too slow. Never
// rejects and never waits long: it is used while someone is clocking in, which
// must not hang on a phone that can't get a fix.
export function getCurrentFix({ timeout = 8000 } = {}) {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null)

  return new Promise(resolve => {
    // getCurrentPosition's own timeout doesn't cover time spent on the
    // permission prompt, so back it with a hard stop.
    const hardStop = setTimeout(() => resolve(null), timeout + 7000)
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(hardStop)
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy ?? 0) })
      },
      () => {
        clearTimeout(hardStop)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout, maximumAge: 15000 },
    )
  })
}
