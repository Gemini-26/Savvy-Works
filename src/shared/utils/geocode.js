// Client-side geocoding via OpenStreetMap's free Nominatim API — no API key
// needed. Found places are cached in localStorage (addresses don't move) and
// requests are queued at ~1/sec to respect Nominatim's usage policy. Misses are
// only remembered for the current page: maps improve, so "not found" last month
// must not mean "not found" forever.
//
// The richer lookup used when capturing a site (several public sources, postcode
// pick-up) lives in siteLookup.js and builds on this.
const CACHE_KEY = 'geocodeCache:v2'
const MIN_GAP_MS = 1100
// The countries the app serves (see constants/countries): ZA, ZW, BW, NA, LS, SZ, MZ.
const COUNTRY_CODES = 'za,zw,bw,na,ls,sz,mz'

let queue = Promise.resolve()
let lastRequestAt = 0
const misses = new Set()

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

// Resolves to the best match for the address, or null if it couldn't be
// geocoded:
//   { lat, lng, postcode, province, addressType, road, houseNumber, name, displayName }
// `addressType` says how specific the match is ('house' and 'road' are a street
// address; 'suburb' or 'city' are only an area). Pass an AbortSignal to drop a
// lookup that has gone stale while it waits its turn in the queue.
export function geocodeAddress(address, { signal } = {}) {
  const key = address?.trim().toLowerCase()
  if (!key || misses.has(key)) return Promise.resolve(null)

  const cache = readCache()
  if (cache[key]) return Promise.resolve(cache[key])

  queue = queue.then(async () => {
    if (signal?.aborted) return null
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    if (signal?.aborted) return null
    lastRequestAt = Date.now()

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=${COUNTRY_CODES}&q=${encodeURIComponent(address)}`,
        { signal },
      )
      const results = await res.json()
      const hit = results?.[0]
      if (!hit) {
        misses.add(key)
        return null
      }
      const point = {
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        postcode: hit.address?.postcode || null,
        province: hit.address?.state || null,
        addressType: hit.addresstype || null,
        road: hit.address?.road || null,
        houseNumber: hit.address?.house_number || null,
        name: hit.name || null,
        displayName: hit.display_name || null,
      }
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
  if (cache[key]) return Promise.resolve(cache[key])

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
      if (address) {
        const fresh = readCache()
        fresh[key] = address
        writeCache(fresh)
      }
      return address
    } catch {
      return null
    }
  })

  return queue
}

// Site addresses are typed free-form ("Unit 62, Village Lane, Steyn City
// Estate, Midrand, …") and OpenStreetMap often can't match the full street
// line, especially inside estates. Tidy the address, then offer progressively
// looser versions, most specific first.
export function addressCandidates(address) {
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

// Resolves to { lat, lng } for the site address, falling back to a nearby match
// (estate, suburb) when the exact address isn't mapped; null if none. This is
// the quick lookup the live map uses for jobs that have no saved location.
export async function geocodeSiteAddress(address) {
  for (const candidate of addressCandidates(address)) {
    const found = await geocodeAddress(candidate)
    if (found) return { lat: found.lat, lng: found.lng }
  }
  return null
}
