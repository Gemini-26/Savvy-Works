import { geocodeAddress, addressCandidates } from './geocode'
import { distanceMeters } from './geo'

// Finds a job site on public maps from the address fields as they are typed.
//
// Sources, tried in this order until one gives a trustworthy match:
//   1. Photon — OpenStreetMap search built for search-as-you-type. It forgives
//      spelling, half-typed words and the way OSM files a street under a
//      neighbouring suburb (Steyn City's roads are filed under Randburg, so a
//      typed "Midrand" defeats strict search).
//   2. Nominatim — OpenStreetMap's own geocoder, with progressively looser
//      versions of the address. Slower (one request a second), so it is the
//      fallback, not the first call.
//   3. The City / province box alone — an area centre, so the map at least
//      moves to the right town.
//
// How precise a match is matters more than whether there is one, because the
// point is used to judge "is the technician at the job?" and (soon) to navigate
// to it:
//   'house'  the right house — the typed house number matches, or it is a named
//            building/business the typed address names. The only precision that
//            counts as `exact`.
//   'street' the right street, but not the right house. OpenStreetMap lacks house
//            numbers for most South African addresses, so this is common; the
//            point is somewhere ON that street.
//   'area'   only an estate, suburb or town.
// Fuzzy search will happily answer "Zzqx Close, Steyn City" with a "Steyn Close"
// 15 km away, so a street result only counts if the street typed really appears
// in it; and "45 Rivonia Road" can come back as "45 Wessels Road", so a matching
// house number on the wrong street counts for nothing.

const PHOTON_URL = 'https://photon.komoot.io/api/'
// Southern Africa — the countries the app serves — so a typed "Main Road" doesn't
// resolve to one on another continent. minLon,minLat,maxLon,maxLat.
const REGION_BBOX = '11,-35.5,41,-8'

// Words that say "this is a road" without saying which one.
const ROAD_WORDS = new Set([
  'street', 'st', 'road', 'rd', 'avenue', 'ave', 'av', 'drive', 'dr', 'lane', 'ln', 'close', 'cl',
  'crescent', 'cres', 'way', 'boulevard', 'blvd', 'court', 'ct', 'place', 'pl', 'circle', 'cir',
  'terrace', 'ter', 'highway', 'hwy',
])

// Words that carry no name: "The Village Medical Centre" is about the village, not "the".
const FILLER_WORDS = new Set(['the', 'of'])

// Nominatim place types that are an area rather than a street address.
const AREA_TYPES = new Set([
  'city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter', 'city_district', 'district',
  'borough', 'hamlet', 'locality', 'municipality', 'county', 'state', 'region', 'postcode',
  'country', 'island', 'isolated_dwelling', 'farm', 'farmland',
])

export const UNIT_SEGMENT = /^(unit|flat|apt|apartment|no\.?|house|erf|stand|suite|shop|office|plot)\s*[\w-]*\d+\w*$/i
export const ESTATE_SEGMENT = /\b(estate|complex)\b/i

// A result further than this from the middle of the typed city is somewhere else.
// Generous on purpose: a metro like Johannesburg is ~50 km across.
const MAX_FROM_CITY_M = 50000
const letters = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

export const join = (...parts) => parts.map(p => String(p || '').trim()).filter(Boolean).join(', ')

// "12 Village Lane" -> "Village Lane" (the street without its house number).
export const withoutNumber = text => String(text || '').replace(/^\d+\w?\s+/, '')

export function segments(address) {
  return String(address || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
}

// The segment that names the street. A unit line, a bare number or an estate /
// complex name isn't one: inside a big estate a point on its main road can be
// hundreds of metres from the unit, so such an address can't be called precise.
function streetSegment(address) {
  return segments(address).find(seg => !UNIT_SEGMENT.test(seg) && !/^\d+\w?$/.test(seg) && !ESTATE_SEGMENT.test(seg)) || ''
}

// "Unit 62, 12 Village Lane, Steyn City Estate" -> "Village Lane"
export function typedStreet(address) {
  return streetSegment(address).replace(/^\d+\w?\s+/, '')
}

// "Unit 62, 12 Village Lane, Steyn City Estate" -> "12" (blank when none was typed)
export function typedNumber(address) {
  return streetSegment(address).match(/^(\d+\w?)\s+\S/)?.[1] ?? ''
}

const sameNumber = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

// The distinctive words of a street name: lower-case, accents folded, short
// words / numbers / "road", "lane"… dropped. "Village Lane" -> ['village'].
export function nameTokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^ -~]/g, '') // accents are split off by NFD above; drop them (and anything else non-ASCII)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !/^\d+$/.test(t) && !ROAD_WORDS.has(t) && !FILLER_WORDS.has(t))
}

// Does one of the result's names contain enough of the street that was typed?
export function streetMatches(typed, resultNames) {
  const want = nameTokens(typed)
  if (!want.length) return false // nothing distinctive was typed, so there's nothing to verify
  const have = new Set(resultNames.flatMap(nameTokens))
  const need = want.length <= 2 ? want.length : want.length - 1
  return want.filter(t => have.has(t)).length >= need
}

// Does the typed text name this building / business? A single shared word isn't
// enough — "Village" is in "The Village Medical Centre" and a hundred other
// places — so most of the place's name has to be what was typed, and most of what
// was typed has to be in the place's name.
export function poiMatches(typed, poi) {
  const want = nameTokens(typed)
  const have = nameTokens(poi)
  if (!want.length || !have.length) return false
  const matched = want.filter(t => have.includes(t)).length
  return matched / have.length >= 0.6 && matched / want.length >= 0.6
}

// ── Photon ──────────────────────────────────────────────────────

// Photon features as plain places:
//   { lat, lng, kind, houseNumber, street, poi, suburb, city, province, country,
//     postcode, label, provider }
// where kind is 'house' | 'street' | 'area' (see the note at the top).
function fromPhoton(feature) {
  const p = feature.properties || {}
  const [lng, lat] = feature.geometry.coordinates
  const isStreetType = p.type === 'street' || p.type === 'house'
  const street = isStreetType ? (p.street || p.name || null) : null
  // A named place standing on a street ("Southern Sun Sandton" on Rivonia Road).
  const poi = p.type === 'house' && p.name && p.street && p.name !== p.street ? p.name : null
  const kind = !isStreetType ? 'area' : (p.housenumber || poi) ? 'house' : 'street'
  const city = p.city || (p.type === 'city' ? p.name : null)
  const suburb = p.locality || p.district || null
  const streetLine = [p.housenumber, street].filter(Boolean).join(' ')
  return {
    lat,
    lng,
    kind,
    houseNumber: p.housenumber || null,
    name: p.name || null,
    street,
    poi,
    suburb,
    city,
    province: p.state || null,
    country: p.country || null,
    postcode: p.postcode || null,
    label: join(isStreetType ? join(poi, streetLine) : p.name, suburb, city, p.postcode),
    provider: 'Photon',
  }
}

const photonCache = new Map()

// Raw search, normalised. Resolves to [] when offline, rate-limited or aborted,
// so the next source gets its turn.
export async function photonPlaces(q, signal, limit = 5) {
  const key = `${limit}|${q}`
  if (photonCache.has(key)) return photonCache.get(key)
  try {
    const res = await fetch(`${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=${limit}&bbox=${REGION_BBOX}`, { signal })
    if (!res.ok) return []
    const features = (await res.json())?.features ?? []
    const places = features.filter(f => f?.geometry?.coordinates).map(fromPhoton)
    if (places.length) photonCache.set(key, places)
    return places
  } catch {
    return []
  }
}

// ── Nominatim ───────────────────────────────────────────────────

function fromNominatim(hit) {
  const isArea = AREA_TYPES.has(hit.addressType)
  const street = hit.road || null
  const poi = !isArea && hit.name && hit.name !== hit.road && hit.addressType !== 'road' ? hit.name : null
  return {
    lat: hit.lat,
    lng: hit.lng,
    kind: isArea ? 'area' : (hit.houseNumber || poi) ? 'house' : 'street',
    houseNumber: hit.houseNumber || null,
    street,
    poi,
    postcode: hit.postcode,
    province: hit.province || null,
    label: (hit.displayName || '').split(', ').slice(0, 4).join(', '),
    provider: 'Nominatim',
  }
}

// ── The chain ───────────────────────────────────────────────────

const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Of several places on the typed street, the one most likely to be the street the
// person means: the street itself rather than a shop standing on it, and the one in
// the suburb they typed (compared without spaces: "Beyers Park" is "Beyerspark").
function bestStreetOf(candidates, city) {
  const want = squash(city)
  const score = place => {
    let points = place.poi ? 0 : 2
    if (want) {
      const where = [place.suburb, place.city].map(squash).filter(Boolean)
      if (where.some(w => w.includes(want) || (w.length >= 5 && want.includes(w)))) points += 4
    }
    return points
  }
  return candidates.reduce((best, c) => (best && score(best) >= score(c) ? best : c), null)
}

// The middle of the typed city, or null when it can't be found. Used to tell a
// result in the right town from a namesake street a thousand kilometres away.
export async function cityCentre(city, province, signal) {
  const typed = String(city || '').trim()
  if (!typed) return null

  // OpenStreetMap often spells a suburb as one word ("Beyerspark"), so a typed
  // "Beyers Park" is looked up joined up as well.
  const spellings = [...new Set([typed, typed.replace(/\s+/g, '')])]
  const want = squash(typed)
  const isNamedLikeTyped = t => squash(t.name) === want

  const towns = []
  for (const name of spellings) {
    if (signal?.aborted) return null
    for (const place of await photonPlaces(join(name, province), signal)) {
      // A "Beyers Park" in the Western Cape is no use to a Gauteng job.
      if (!province || !place.province || letters(place.province) === letters(province)) towns.push(place)
    }
    if (towns.some(t => t.kind === 'area' && isNamedLikeTyped(t))) break
  }

  // A real place (suburb, town) that is called what was typed beats everything;
  // after that, any place of that name; then (only when a province was typed to
  // keep it honest) whatever the search put first.
  const rank = t => (isNamedLikeTyped(t) ? 0 : 2) + (t.kind === 'area' ? 0 : 1)
  const best = [...towns].sort((a, b) => rank(a) - rank(b))[0] ?? null
  if (!best) return null
  // With no province typed, a place that is not even called what was typed (a
  // "Beyers Road Park" in Cape Town for "Beyers Park") is a guess, and a wrong
  // guess pins the whole lookup to the wrong city: better to know nothing.
  if (!province && !isNamedLikeTyped(best)) return null
  return best
}

// Is the place where the typed province / city say it should be? OpenStreetMap
// files places under surprising suburbs (Steyn City is under "Randburg", not
// "Midrand"), so the city is judged by distance, not by name.
export function isPlausiblePlace(place, { province, centre }) {
  if (province && place.province && letters(place.province) !== letters(province)) return false
  if (centre && distanceMeters(place, centre) > MAX_FROM_CITY_M) return false
  return true
}


// fields: { address, city, province, postcode } — the site_* form values.
// Resolves to null when nothing was found, otherwise:
//   { lat, lng, precision, exact, postcode, postcodeFrom, label, provider }
// `exact` is true only for precision 'house'. `postcode` is only worked out when
// `fields.postcode` is blank (one that is already filled in is left alone, and is
// used to sharpen the search instead); `postcodeFrom` is 'match' (the place found
// has one) or 'city' (taken from the City box). Pass an AbortSignal to cancel a
// lookup that has gone stale.
export async function lookupSite({ address, city, province, postcode }, { signal } = {}) {
  const street = typedStreet(address)
  const number = typedNumber(address)
  const lines = segments(address)
    .filter(s => !UNIT_SEGMENT.test(s))
    .map(s => s.replace(/\b(estate|complex)\b/gi, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const lineText = lines.join(', ')
  // Photon is thrown by a house number it doesn't have: "12 Village La" finds a
  // medical centre, "Village La" finds the lane. So the street is also searched
  // without its number (a numbered result is only believed if the number matches).
  const lineTextNoNumber = lines.map(withoutNumber).join(', ')
  const cleanPostcode = /^\d{4}$/.test(String(postcode || '').trim()) ? String(postcode).trim() : ''

  // Where the typed city is, so a namesake street in another town can be thrown out.
  const centre = await cityCentre(city, province, signal)
  if (signal?.aborted) return null
  // With neither a province nor a findable city there is nothing to say the
  // result is in the right place, so it can't be trusted as an exact house.
  const localityKnown = Boolean(centre || province)
  // Searches find streets better with a province in them; if none was typed, use the
  // one the typed town is in.
  const searchProvince = province || centre?.province || ''

  const precisionOf = place => {
    if (!isPlausiblePlace(place, { province, centre })) return null
    if (place.kind === 'area') return 'area'
    if (place.poi && poiMatches(street, place.poi)) return localityKnown ? 'house' : 'street'
    if (!streetMatches(street, [place.street])) return null // some other street entirely
    if (number && place.houseNumber && sameNumber(place.houseNumber, number)) return localityKnown ? 'house' : 'street'
    return 'street'
  }

  // Only a 'house' match ends the search. The best street and area matches seen
  // along the way are kept as fallbacks — but only from searches pinned to the
  // typed city, because one on the street name alone can land on a namesake in
  // another town.
  const streetCandidates = []
  let bestArea = null
  const consider = (place, fallbackOk) => {
    const precision = precisionOf(place)
    if (precision === 'house') return { ...place, precision }
    if (fallbackOk && precision === 'street') streetCandidates.push({ ...place, precision })
    if (fallbackOk && precision === 'area' && !bestArea) bestArea = { ...place, precision }
    return null
  }

  let found = null

  // 1. Photon. A typed postcode goes into the first, most specific search; the
  //    later ones drop it in case it was a typo.
  if (lineText || city) {
    // The street without its number goes second: it is the search most likely to
    // surface the street, and once a street is verified there is little more to
    // learn from searching again.
    // The typed town as the map itself spells it ("Beyers Park" -> "Beyerspark,
    // Boksburg"), which finds streets the typed spelling misses.
    const mapTown = centre?.kind === 'area' && centre.name ? join(centre.name, centre.city !== centre.name ? centre.city : '') : ''
    const searches = [
      { q: join(lineText, city, searchProvince, cleanPostcode), fallbackOk: true },
      { q: join(lineTextNoNumber, city, searchProvince), fallbackOk: true },
      { q: join(lineText, mapTown), fallbackOk: true },
      { q: join(lineTextNoNumber, mapTown), fallbackOk: true },
      { q: join(lineText, city), fallbackOk: true },
      { q: join(lineText), fallbackOk: !city },
    ].filter((s, i, all) => s.q && all.findIndex(o => o.q === s.q) === i)

    for (const [i, { q, fallbackOk }] of searches.entries()) {
      if (signal?.aborted) return null
      for (const place of await photonPlaces(q, signal)) {
        found = consider(place, fallbackOk)
        if (found) break
      }
      if (found || (streetCandidates.length && i >= 1)) break
    }
  }

  // 2. Nominatim, loosening the address a step at a time. Only when Photon found
  //    no street at all: both read the same OpenStreetMap data, so if Photon has
  //    the street but not the house, Nominatim won't have the house either — and
  //    each attempt costs over a second.
  if (!found && !streetCandidates.length && lineText) {
    const full = join(address, city, searchProvince, cleanPostcode)
    for (const c of addressCandidates(full).slice(0, 3)) {
      if (signal?.aborted) return null
      const hit = await geocodeAddress(c, { signal })
      if (!hit) continue
      found = consider(fromNominatim(hit), true)
      if (found) break
    }
  }

  if (signal?.aborted) return null
  let result = found || bestStreetOf(streetCandidates, city) || bestArea

  // 3. Nothing at all: put the map on the town, which is still better than
  //    leaving it on the whole region.
  if (!result && centre) result = { ...centre, precision: 'area' }
  if (!result || signal?.aborted) return null

  // Postcode: use what the place has; failing that, ask about the City box.
  let postcodeFrom = null
  let resultPostcode = null
  if (!cleanPostcode) {
    if (result.postcode) {
      resultPostcode = result.postcode
      postcodeFrom = 'match'
    } else if (centre?.postcode) {
      resultPostcode = centre.postcode
      postcodeFrom = 'city'
    }
  }
  if (signal?.aborted) return null

  return {
    lat: result.lat,
    lng: result.lng,
    precision: result.precision,
    exact: result.precision === 'house',
    postcode: resultPostcode,
    postcodeFrom,
    // The town the typed place sits in, as the map names it ("Beyers Park" -> "Boksburg").
    town: centre?.city ?? null,
    label: result.label,
    provider: result.provider,
  }
}
