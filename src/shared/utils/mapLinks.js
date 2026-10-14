// Links out to Google Maps, and reading a location pasted back from it.
//
// Public maps often don't know a house number, but Google Maps usually does. So
// instead of guessing, the site map links to Google (Street View, satellite, and
// a search for the typed address) and accepts the exact spot pasted back in. These
// are plain "Maps URLs" — no API key, nothing sent from this app to Google.

const num = '-?\\d+(?:\\.\\d+)?'

// Southern Africa, the countries the app serves: a pasted point outside it is
// almost certainly a typo or a flipped pair, not a job site.
const REGION = { minLat: -35.5, maxLat: -8, minLng: 11, maxLng: 41 }
const inRegion = (lat, lng) => lat >= REGION.minLat && lat <= REGION.maxLat && lng >= REGION.minLng && lng <= REGION.maxLng

const roundPoint = n => Math.round(n * 1e6) / 1e6

// Where the person types the address into Google Maps and sees Google's own pin.
export function googleSearchUrl(addressText) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
}

const isIOS = () =>
  typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// Turn-by-turn directions to a site, opened in the phone's own maps app: iPhones
// get Apple Maps, everything else gets Google Maps (Android hands the link to the
// installed app). `destination` is { lat, lng } for a pin, or the address as text.
export function directionsUrl(destination) {
  if (typeof destination === 'string') {
    const q = encodeURIComponent(destination)
    return isIOS() ? `https://maps.apple.com/?daddr=${q}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`
  }
  const point = `${destination.lat},${destination.lng}`
  return isIOS() ? `https://maps.apple.com/?daddr=${point}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=driving`
}

// The street-level photos at a point.
export function googleStreetViewUrl(lat, lng) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat}%2C${lng}`
}

// The satellite view at a point, zoomed right in on the roofs.
export function googleSatelliteUrl(lat, lng) {
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${lat}%2C${lng}&zoom=20&basemap=satellite`
}

// Reads a point out of whatever was pasted from Google Maps:
//   "-26.18474, 28.26572"      right-click a spot, click the coordinates to copy
//   a link with "!3d-26.18!4d28.26"   the exact place in an address-bar link
//   a link with "@-26.18,28.26,17z"   the centre of the map in an address-bar link
//   a link with "?q=-26.18,28.26" / "query=" / "ll=" / "center=" / "viewpoint="
// Resolves to { lat, lng } or null. Short links (maps.app.goo.gl/...) hide the
// point behind a redirect a browser app can't follow, so they come back null.
export function parseCoordinates(text) {
  let t = String(text || '').trim()
  if (!t) return null
  try {
    t = decodeURIComponent(t)
  } catch {
    // not URL-encoded text — read it as it is
  }

  const patterns = [
    new RegExp(`!3d(${num})!4d(${num})`),
    new RegExp(`@(${num}),(${num})`),
    new RegExp(`[?&](?:q|query|ll|center|viewpoint|destination)=(${num})[,\\s]\\s*(${num})`, 'i'),
    new RegExp(`^\\s*(${num})\\s*[,;\\s]\\s*(${num})\\s*$`),
  ]

  for (const pattern of patterns) {
    const m = t.match(pattern)
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2])
    if (inRegion(a, b)) return { lat: roundPoint(a), lng: roundPoint(b) }
    if (inRegion(b, a)) return { lat: roundPoint(b), lng: roundPoint(a) } // pasted longitude first
  }
  return null
}
