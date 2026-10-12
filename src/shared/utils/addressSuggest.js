import { photonPlaces, cityCentre, isPlausiblePlace, segments, join, withoutNumber, UNIT_SEGMENT, ESTATE_SEGMENT, typedNumber, typedStreet } from './siteLookup'
import { SA_PROVINCES } from '../constants/regions'
import { COUNTRIES } from '../constants/countries'

// Type-ahead for the site Address box: as the address is typed, a short list of
// matching places from public maps (OpenStreetMap, via Photon, which is built
// for search-as-you-type), each of which fills in the whole address when picked.
//
// Every suggestion is a "place" as produced by siteLookup (kind 'house' | 'street'
// | 'area'). Anything that can list places — a different provider, say — can feed
// the same list and the same pick handling.

const KIND_RANK = { house: 0, street: 1, area: 2 }
const letters = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// How well a place's name fits what has been typed so far. Every typed word counts
// if some word of the place starts with it, so a half-typed "Village La" already
// scores for "Village Lane".
function relevance(place, text) {
  const typed = String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !/^\d+$/.test(w))
  const words = [place.street, place.poi, place.suburb, place.city].flatMap(n => String(n || '').toLowerCase().split(/[^a-z0-9]+/))
  return typed.filter(t => words.some(w => w.startsWith(t))).length
}

// Is what was typed for the street (possibly half-typed) this street? Every typed
// word has to be the start of one of the street's words: "Village La" fits
// "Village Lane", "Zzqx Close" does not fit "Steyn Close".
function typedStreetFits(typed, street) {
  const words = String(typed || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !/^\d+$/.test(w))
  const have = String(street || '').toLowerCase().split(/[^a-z0-9]+/)
  return words.length > 0 && words.every(w => have.some(h => h.startsWith(w)))
}

const sameNumber = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

// Resolves to up to five { id, primary, secondary, kind, place }, best first:
// places in the typed province / city before anywhere else, then the ones that
// best fit the typed words, then exact addresses before streets before areas.
// Pass an AbortSignal to drop a search that has been overtaken by more typing.
export async function suggestAddresses(text, { city, province, signal } = {}) {
  const lines = segments(text)
    .filter(s => !UNIT_SEGMENT.test(s))
    .map(s => s.replace(/\b(estate|complex)\b/gi, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const query = join(...lines)
  if (query.length < 3) return []

  const number = typedNumber(text)
  const streetQuery = join(...lines.map(withoutNumber))

  // The street is searched without its number: a house number the map doesn't
  // have makes it match unrelated places. The numbered search runs alongside, and
  // only a result carrying exactly that number is taken from it.
  const [byStreet, byNumber, centre] = await Promise.all([
    photonPlaces(streetQuery, signal, 8),
    number && query !== streetQuery ? photonPlaces(query, signal, 8) : [],
    cityCentre(city, province, signal),
  ])
  const exactHouses = byNumber.filter(p => p.houseNumber && sameNumber(p.houseNumber, number))

  const seen = new Set()
  // A namesake street in another town is a legitimate suggestion, just not the
  // first one to offer: it sinks below every place that fits the city / province.
  const plausible = p => (isPlausiblePlace(p, { province, centre }) ? 0 : 1)
  return [...exactHouses, ...byStreet]
    .filter(p => !seen.has(p.label) && seen.add(p.label))
    .sort((a, b) => plausible(a) - plausible(b) || relevance(b, streetQuery) - relevance(a, streetQuery) || KIND_RANK[a.kind] - KIND_RANK[b.kind])
    .slice(0, 5)
    .map(place => {
      const [primary, ...rest] = place.label.split(', ')
      return {
        id: `${place.lat},${place.lng},${place.label}`,
        primary,
        secondary: join(...rest, place.province),
        kind: place.kind,
        place,
        centre,
      }
    })
}

// The form fields to set when a suggestion is picked: the whole address, the
// town, province, postcode and country where the map knows them, and the exact
// point. Whatever else was typed stays: a unit/flat line and an estate/complex
// name keep their places around the street, and a house number that was typed
// is kept when the map has no number of its own (it is usually missing).
export function suggestionPatch(typedText, place, { city, province, centre } = {}) {
  const segs = segments(typedText)
  const units = segs.filter(s => UNIT_SEGMENT.test(s))
  const estates = segs.filter(s => !UNIT_SEGMENT.test(s) && ESTATE_SEGMENT.test(s))

  const patch = {
    site_lat: Math.round(place.lat * 1e6) / 1e6,
    site_lng: Math.round(place.lng * 1e6) / 1e6,
    // Only a matched house is trusted as "the address"; the rest is a point on the
    // street or in the area, which an admin confirms with the pin.
    site_geo_source: place.kind === 'house' ? 'address' : 'approx',
  }

  // Picking a suburb or town replaces nothing the person typed about the street.
  if (place.kind !== 'area') {
    // A typed number belongs to the street it was typed for, not whichever street
    // was picked.
    const number = place.houseNumber || (typedStreetFits(typedStreet(typedText), place.street) ? typedNumber(typedText) : '')
    const road = [number, place.street].filter(Boolean).join(' ')
    patch.site_address = [...units, place.poi, road, ...estates].filter(Boolean).join('\n')
  }

  // The town the person typed stays when the place really is in it: OpenStreetMap
  // files places under surprising towns (Steyn City is under "Randburg", yet the
  // post goes to "Midrand"). It only changes for a place somewhere else entirely.
  const inTypedTown = String(city || '').trim() && isPlausiblePlace(place, { province, centre })
  const placeTown = place.city || place.suburb
  if (placeTown && !inTypedTown) patch.site_city = placeTown
  const placeProvince = SA_PROVINCES.find(p => letters(p) === letters(place.province))
  if (placeProvince) patch.site_county = placeProvince
  if (place.postcode) patch.site_postcode = place.postcode
  const country = COUNTRIES.find(c => letters(c) === letters(place.country))
  if (country) patch.site_country = country

  return patch
}
