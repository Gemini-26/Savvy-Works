// Client-side geocoding via OpenStreetMap's free Nominatim API — no API key
// needed. Results are cached in localStorage (addresses don't move) and
// requests are queued at ~1/sec to respect Nominatim's usage policy.
const CACHE_KEY = 'geocodeCache:v1'
const MIN_GAP_MS = 1100

let queue = Promise.resolve()
let lastRequestAt = 0

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}
  } catch {
    return {}
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage full or unavailable — cache just won't persist
  }
}

// Resolves to { lat, lng } or null if the address couldn't be geocoded.
export function geocodeAddress(address) {
  const key = address?.trim().toLowerCase()
  if (!key) return Promise.resolve(null)

  const cache = readCache()
  if (key in cache) return Promise.resolve(cache[key])

  queue = queue.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastRequestAt = Date.now()

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      )
      const results = await res.json()
      const point = results?.[0] ? { lat: Number(results[0].lat), lng: Number(results[0].lon) } : null
      const fresh = readCache()
      fresh[key] = point
      writeCache(fresh)
      return point
    } catch {
      return null
    }
  })

  return queue
}

// Resolves a { lat, lng } GPS fix to a human-readable address string (or
// null). Coordinates are rounded before caching so nearby pings from the
// same spot (GPS jitter) reuse one cache entry instead of re-querying.
export function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return Promise.resolve(null)

  const key = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`
  const cache = readCache()
  if (key in cache) return Promise.resolve(cache[key])

  queue = queue.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastRequestAt = Date.now()

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      )
      const result = await res.json()
      const address = result?.display_name ?? null
      const fresh = readCache()
      fresh[key] = address
      writeCache(fresh)
      return address
    } catch {
      return null
    }
  })

  return queue
}

// Site addresses are typed free-form ("Unit 62, Village Lane, Steyn City
// Estate, Midrand, …") and OpenStreetMap often can't match the full street
// line, especially inside estates. Tidy the address, then try progressively
// looser versions and keep the first that resolves.
function addressCandidates(address) {
  const seen = new Set()
  const segs = String(address)
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => s && !/^\d{4}$/.test(s)) // postcodes confuse the search
    .map(s => s.replace(/\b(estate|complex)\b/gi, '').replace(/\s+/g, ' ').trim())
    .filter(s => {
      const k = s.toLowerCase()
      if (!k || seen.has(k)) return false // city/province repeated by the form
      seen.add(k)
      return true
    })
    .filter(s => !/^(unit|flat|apt|apartment|no\.?|house|erf|stand)\s*\d+\w*$/i.test(s) && !/^\d+\w?$/.test(s))

  const out = []
  for (let i = 0; i < segs.length - 1 || i === 0; i++) {
    const rest = segs.slice(i)
    out.push(rest.join(', '))
    // Drop the city between the street/estate and the province.
    if (rest.length > 3) out.push([...rest.slice(0, 2), rest[rest.length - 1]].join(', '))
    if (rest.length <= 2) break
  }
  return [...new Set(out.filter(Boolean))]
}

// Resolves to { lat, lng } for the site address, falling back to a nearby
// match (estate, suburb) when the exact address isn't mapped; null if none.
export async function geocodeSiteAddress(address) {
  for (const candidate of addressCandidates(address)) {
    const point = await geocodeAddress(candidate)
    if (point) return point
  }
  return null
}
