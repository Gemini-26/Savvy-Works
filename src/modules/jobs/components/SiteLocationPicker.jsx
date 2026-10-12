import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { lookupSite } from '../../../shared/utils/siteLookup'
import { googleSearchUrl, googleStreetViewUrl, googleSatelliteUrl, parseCoordinates } from '../../../shared/utils/mapLinks'
import { DEFAULT_RADIUS_M, MIN_RADIUS_M, MAX_RADIUS_M, locationSearchKey } from '../../../shared/utils/siteLocation'

const RADIUS_CHIPS = [50, 100, 150, 250, 500]

// Johannesburg, roughly the middle of the map when nothing is located yet.
const DEFAULT_CENTER = [-26.2041, 28.0473]

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#DC2626;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.45);transform:rotate(-45deg)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 26],
})

const round6 = n => Math.round(n * 1e6) / 1e6

// What the pin means, and what to do about it. An approximate pin (street or
// area level) never produces a flag — the database only flags a technician against
// an address-level match or a pin an admin has confirmed.
function pinNote(source, precision, readOnly) {
  if (source === 'pin') return { tone: 'text-blue-700', text: 'Pin confirmed by an admin.' }
  if (source === 'address') {
    return { tone: 'text-green-700', text: readOnly ? 'Matched to the exact address.' : 'Matched to the exact address. Check the pin is on the right house.' }
  }
  if (readOnly) return { tone: 'text-amber-700', text: 'Approximate location — open Edit to place the pin on the house.' }
  const tail = 'Drag the pin onto the house — or find it in Google Maps and paste its coordinates below — then confirm it. Until it is confirmed, clock-in location checks are logged but never flagged.'
  if (precision === 'area') return { tone: 'text-amber-700', text: `Only the area (suburb or town) could be found. ${tail}` }
  if (precision === 'street') return { tone: 'text-amber-700', text: `Found the street, but the map has no record of this house number. ${tail}` }
  return { tone: 'text-amber-700', text: `This point is approximate (street or suburb level). ${tail}` }
}

// Pans/zooms the map to a newly found point without fighting the admin while
// they drag the pin around (it only moves the view if the point has left it).
function FollowPoint({ lat, lng }) {
  const map = useMap()
  useEffect(() => {
    // The map can mount inside a tab or column that is still laying out.
    const t = setTimeout(() => map.invalidateSize(), 0)
    return () => clearTimeout(t)
  }, [map])
  useEffect(() => {
    if (lat == null || lng == null) return
    if (map.getZoom() < 14 || !map.getBounds().contains([lat, lng])) map.setView([lat, lng], 16)
  }, [map, lat, lng])
  return null
}

function ClickToPin({ onPick }) {
  useMapEvents({ click: e => onPick(round6(e.latlng.lat), round6(e.latlng.lng)) })
  return null
}

// The site's position and fence radius for a job. Follows the address as it is
// typed (never overwriting a pin an admin has placed), fills in a blank postcode
// from the map, and lets an admin click the map or drag the pin to the exact spot.
//
//   value     the job form (or row): the site_* address fields it reads, plus
//             { site_lat, site_lng, site_radius_m, site_geo_source }
//   onChange  called with a partial patch of those fields — including
//             site_postcode, when the box was blank and the map knew it
//   picked    { key, kind, label } of a suggestion that was just picked in the
//             address box (key as from locationSearchKey): its point is already
//             as good as it gets, so don't search for it — and describe it
export default function SiteLocationPicker({ value, onChange, picked = null, readOnly = false }) {
  const lat = value.site_lat
  const lng = value.site_lng
  const radius = value.site_radius_m ?? DEFAULT_RADIUS_M
  const source = value.site_geo_source
  const hasPoint = lat != null && lng != null

  const [lookup, setLookup] = useState('idle') // idle | looking | notfound
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState(false)
  const [match, setMatch] = useState(null) // what the last lookup found, shown under the map
  // A postcode this component filled in itself. It is treated as "still blank":
  // it never counts as something the person typed, so it can be replaced when the
  // address changes and doesn't re-trigger a search when it appears.
  const [autoPostcode, setAutoPostcode] = useState('')
  const [radiusText, setRadiusText] = useState(String(radius))
  const [seenRadius, setSeenRadius] = useState(radius)
  if (radius !== seenRadius) {
    // The radius changed from outside the text box (a chip, a reset) — follow it.
    setSeenRadius(radius)
    setRadiusText(String(radius))
  }

  const address = (value.site_address || '').trim()
  const city = (value.site_city || '').trim()
  const province = (value.site_county || '').trim()
  const typedPostcode = value.site_postcode && value.site_postcode !== autoPostcode ? String(value.site_postcode).trim() : ''
  // Enough to be worth a search: a few letters of street, or a town.
  const searchable = address.length >= 3 || city.length >= 3
  const searchKey = [address, city, province, typedPostcode].join('|')
  // The same address as locationSearchKey sees it, postcode and all.
  const fullKey = locationSearchKey(value)

  // Async lookups need the current value when they land, not the one they started with.
  const latest = useRef({ value, autoPostcode })
  useEffect(() => { latest.current = { value, autoPostcode } })

  // The search the current point was found for; undefined until the first look.
  const handledKey = useRef(undefined)
  // Set while the "Locate from address" button is searching, which is allowed to replace a pin.
  const forceRef = useRef(false)

  // Runs a lookup and applies what it finds. Resolves false when nothing was found.
  async function findAndApply(key, signal) {
    const found = await lookupSite(
      { address, city, province, postcode: typedPostcode },
      { signal },
    )
    if (signal.aborted) return true
    if (!found) {
      setLookup('notfound')
      setMatch(null)
      return false
    }
    setLookup('idle')

    const now = latest.current
    if (now.value.site_geo_source === 'pin' && !forceRef.current) return true

    handledKey.current = key
    const patch = { site_lat: round6(found.lat), site_lng: round6(found.lng), site_geo_source: found.exact ? 'address' : 'approx' }
    // Only into a blank box (or one we filled ourselves) — what someone typed stays.
    const postcodeFree = !now.value.site_postcode || now.value.site_postcode === now.autoPostcode
    if (found.postcode && postcodeFree) {
      patch.site_postcode = found.postcode
      setAutoPostcode(found.postcode)
    }
    setMatch({ label: found.label, provider: found.provider, precision: found.precision, town: found.town, postcode: patch.site_postcode || null, postcodeFrom: found.postcodeFrom })
    onChange(patch)
    return true
  }

  useEffect(() => {
    if (readOnly || !searchable) return

    // First sight of this form: a point that is already there belongs to the
    // address that is already there — don't search for it again.
    if (handledKey.current === undefined) handledKey.current = latest.current.value.site_lat != null ? searchKey : null
    // Nothing to search for. A search that was cancelled to get here (more typing,
    // a suggestion picked) never reports back, so the "looking" state is cleared here.
    const skip = () => { setLookup('idle') }

    // A picked suggestion already carries its own exact point.
    if (picked && (picked.key === searchKey || picked.key === fullKey)) {
      handledKey.current = searchKey
      return skip()
    }
    if (handledKey.current === searchKey) return skip()
    // An admin's pin outranks anything the address says.
    if (latest.current.value.site_geo_source === 'pin') return skip()

    const controller = new AbortController()
    setLookup('looking')
    // Short debounce so the map follows the typing, but not every keystroke.
    // Anything still in flight when the next change lands is cancelled.
    const timer = setTimeout(() => { findAndApply(searchKey, controller.signal) }, 600)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, readOnly, picked])

  // The "Locate from address" button: search now, even over an admin's pin.
  async function locateFromAddress() {
    if (!searchable) return
    setLookup('looking')
    forceRef.current = true
    try {
      await findAndApply(searchKey, new AbortController().signal)
    } finally {
      forceRef.current = false
    }
  }

  function setPin(newLat, newLng) {
    handledKey.current = searchKey
    setMatch(null)
    onChange({ site_lat: newLat, site_lng: newLng, site_geo_source: 'pin' })
  }

  // A spot copied out of Google Maps: exact, and placed by a person, so it is a pin.
  function applyPasted() {
    const point = parseCoordinates(pasteText)
    if (!point) {
      setPasteError(true)
      return
    }
    setPasteError(false)
    setPasteText('')
    setPin(point.lat, point.lng)
  }

  function clearLocation() {
    setLookup('idle')
    setMatch(null)
    onChange({ site_lat: null, site_lng: null, site_geo_source: null })
  }

  function commitRadius(text) {
    const n = parseInt(text, 10)
    if (Number.isFinite(n) && n >= MIN_RADIUS_M && n <= MAX_RADIUS_M) onChange({ site_radius_m: n })
  }

  function onRadiusBlur() {
    const n = parseInt(radiusText, 10)
    const clamped = Number.isFinite(n) ? Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, n)) : DEFAULT_RADIUS_M
    setRadiusText(String(clamped))
    onChange({ site_radius_m: clamped })
  }

  // What the pin is described by: the suggestion that was just picked, if the
  // address is still the one it filled in; otherwise the last search's result.
  const pickedNow = picked && (picked.key === searchKey || picked.key === fullKey) ? picked : null
  const shown = pickedNow ? { label: pickedNow.label, provider: 'Photon', precision: pickedNow.kind } : match
  const note = hasPoint ? pinNote(source, shown?.precision, readOnly) : null
  // The address as Google Maps should be asked for it: one line, as typed. A postcode
  // goes in only if the person typed it — one this form filled in from OpenStreetMap
  // (or a picked suggestion) can be wrong, and Google leans hard on the postcode: if
  // "13 Bartlett Road" isn't in that postcode it answers with the nearest number it
  // does have, such as "131". The town the map identified (Boksburg) is added when it
  // wasn't typed, because "Beyers Park" alone is ambiguous.
  const mapTown = !pickedNow && match?.town && match.town.toLowerCase() !== city.toLowerCase() ? match.town : ''
  const googleQuery = [
    address.replace(/\s*[\r\n]+\s*/g, ', '),
    city,
    mapTown,
    province,
    pickedNow ? '' : typedPostcode,
    value.site_country || 'South Africa',
  ].filter(Boolean).join(', ')
  const linkCls = 'text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline'

  return (
    <div className="space-y-2">
      <div className="rounded border border-gray-200 overflow-hidden relative" style={{ height: readOnly ? 200 : 240 }}>
        <MapContainer
          center={hasPoint ? [lat, lng] : DEFAULT_CENTER}
          zoom={hasPoint ? 16 : 6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FollowPoint lat={lat} lng={lng} />
          {!readOnly && <ClickToPin onPick={setPin} />}
          {hasPoint && (
            <Circle
              center={[lat, lng]}
              radius={radius}
              pathOptions={{ color: '#DC2626', weight: 2, dashArray: '6 6', fillColor: '#DC2626', fillOpacity: 0.08 }}
            />
          )}
          {hasPoint && (
            <Marker
              position={[lat, lng]}
              icon={pinIcon}
              draggable={!readOnly}
              eventHandlers={readOnly ? {} : {
                dragend: e => {
                  const p = e.target.getLatLng()
                  setPin(round6(p.lat), round6(p.lng))
                },
              }}
            />
          )}
        </MapContainer>
        {!hasPoint && (
          <div className="absolute inset-x-0 bottom-0 z-[500] bg-white/90 text-xs text-gray-600 px-3 py-1.5 border-t border-gray-200 pointer-events-none">
            {readOnly
              ? 'No site location set.'
              : lookup === 'looking'
              ? 'Looking up the address…'
              : 'Not located yet — fill in the address, or click the map to drop a pin.'}
          </div>
        )}
      </div>

      {note && <p className={`text-xs ${note.tone}`}>{note.text}</p>}
      {shown?.label && source !== 'pin' && (
        <p className="text-xs text-gray-500">{pickedNow ? 'Picked' : 'Found'}: {shown.label} <span className="text-gray-400">· OpenStreetMap ({shown.provider})</span></p>
      )}
      {match?.postcode && match.postcode === value.site_postcode && (
        <p className="text-xs text-gray-500">
          Postcode {match.postcode} filled in {match.postcodeFrom === 'city' ? `from the City box (${city})` : 'from the map'} — check it's right.
        </p>
      )}
      {lookup === 'looking' && hasPoint && <p className="text-xs text-gray-400">Looking up the address…</p>}
      {lookup === 'notfound' && (
        <p className="text-xs text-amber-700">
          Couldn't find that address on the public maps. Check the spelling or the City, or click the map to drop a pin on the site.
        </p>
      )}

      {(hasPoint || searchable) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {hasPoint && (
            <a href={googleStreetViewUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className={linkCls}>Street View ↗</a>
          )}
          {hasPoint && (
            <a href={googleSatelliteUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className={linkCls}>Satellite ↗</a>
          )}
          {searchable && (
            <a href={googleSearchUrl(googleQuery)} target="_blank" rel="noopener noreferrer" title={`Searches Google Maps for: ${googleQuery}`} className={linkCls}>Find this address in Google Maps ↗</a>
          )}
        </div>
      )}

      {hasPoint && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
          <span>
            Fence radius{' '}
            {readOnly ? (
              <span className="font-semibold text-gray-800">{radius} m</span>
            ) : (
              <>
                <input
                  type="number"
                  min={MIN_RADIUS_M}
                  max={MAX_RADIUS_M}
                  step={25}
                  value={radiusText}
                  onChange={e => { setRadiusText(e.target.value); commitRadius(e.target.value) }}
                  onBlur={onRadiusBlur}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />{' '}m
              </>
            )}
          </span>
          {!readOnly && RADIUS_CHIPS.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ site_radius_m: m })}
              className={`px-2 py-0.5 rounded-full border ${radius === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
            >
              {m} m
            </button>
          ))}
          <span className="text-gray-400">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={locateFromAddress}
            disabled={!searchable || lookup === 'looking'}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {source === 'pin' ? 'Re-locate from address (replaces pin)' : 'Locate from address'}
          </button>
          {hasPoint && source !== 'pin' && (
            <button
              type="button"
              onClick={() => onChange({ site_geo_source: 'pin' })}
              className="text-xs font-medium text-green-700 hover:text-green-800 border border-green-300 hover:border-green-500 px-3 py-1 rounded transition-colors"
            >
              ✓ Pin is on the right spot — confirm
            </button>
          )}
          {hasPoint && (
            <button
              type="button"
              onClick={clearLocation}
              className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1 rounded transition-colors"
            >
              Clear location
            </button>
          )}
          <span className="text-xs text-gray-400">Click the map or drag the pin to set the exact spot.</span>
        </div>
      )}

      {!readOnly && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setPasteError(false) }}
              // Inside the job form, Enter would save the whole job.
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyPasted() } }}
              placeholder="Paste coordinates or a Google Maps link, e.g. -26.18474, 28.26572"
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={applyPasted}
              disabled={!pasteText.trim()}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Set pin
            </button>
          </div>
          {pasteError ? (
            <p className="text-xs text-red-600">
              Couldn't read a location from that. Paste two numbers like -26.18474, 28.26572, or the full link from Google Maps' address bar (short maps.app.goo.gl links can't be read).
            </p>
          ) : (
            <p className="text-[11px] text-gray-400">
              Google Maps knows the house? Open "Find this address in Google Maps", right-click the house, and click the numbers at the top of the menu to copy them.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
