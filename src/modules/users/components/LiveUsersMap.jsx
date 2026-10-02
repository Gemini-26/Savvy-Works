import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geocodeSiteAddress } from '../../../shared/utils/geocode'

const techIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#3B82F6;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

// Sites are squares in the assigned technician's colour: solid with a dark
// ring for a site being worked now, hollow for an upcoming one.
function siteIcon(color, current, onRoute) {
  if (onRoute) {
    // Solid square in the technician's colour with a pulsing ring: someone is on the way.
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:24px;height:24px">
        <span class="sw-pulse" style="position:absolute;inset:0;border-radius:9999px;border:3px solid ${color}"></span>
        <div style="position:absolute;left:4px;top:4px;width:16px;height:16px;background:${color};border:2px solid #111827;border-radius:3px"></div>
      </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }
  const style = current
    ? `background:${color};border:2px solid #111827;width:16px;height:16px`
    : `background:white;border:3px solid ${color};width:12px;height:12px`
  return L.divIcon({
    className: '',
    html: `<div style="${style};border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

const DEFAULT_CENTER = [-26.2041, 28.0473] // Johannesburg, roughly the middle of the map when nothing else is known
const RECENT_MS = 15 * 60 * 1000 // a GPS fix older than this is stale, not "live"

// Geocodes each site address once and caches the result for the life of
// this mount — addresses repeat often (same site, many visits).
function useGeocodedSites(addresses) {
  const [points, setPoints] = useState({})

  useEffect(() => {
    addresses.forEach(async (address) => {
      if (points[address] !== undefined) return
      const point = await geocodeSiteAddress(address)
      setPoints(prev => (prev[address] !== undefined ? prev : { ...prev, [address]: point }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.join('|')])

  return points
}

export default function LiveUsersMap({ users, sites = [] }) {
  const addresses = [...new Set(sites.map(v => v.location).filter(Boolean))]
  const sitePoints = useGeocodedSites(addresses)

  const techMarkers = users.filter(u => u.lastLat != null && u.lastLng != null && u.lastLocationAgeMs < RECENT_MS)
  const siteMarkers = sites
    .filter(v => v.location && sitePoints[v.location])
    .map(v => ({ site: v, point: sitePoints[v.location] }))

  const allPoints = [
    ...techMarkers.map(u => [u.lastLat, u.lastLng]),
    ...siteMarkers.map(m => [m.point.lat, m.point.lng]),
  ]
  const center = allPoints.length ? allPoints[0] : DEFAULT_CENTER

  // Dashed line from each on-route technician's live GPS position to the site
  // they're heading to.
  const routeLines = siteMarkers
    .filter(({ site }) => site.onRoute)
    .flatMap(({ site, point }) => site.technicians
      .map(t => users.find(u => u.technicianId === t.id))
      .filter(u => u && u.lastLat != null && u.lastLocationAgeMs < RECENT_MS)
      .map(u => ({ key: `${site.id}-${u.technicianId}`, color: site.color, from: [u.lastLat, u.lastLng], to: [point.lat, point.lng] })))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <style>{`@keyframes sw-pulse{0%{transform:scale(.7);opacity:.9}100%{transform:scale(1.5);opacity:0}}.sw-pulse{animation:sw-pulse 1.6s ease-out infinite}`}</style>
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Live Map</h2>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Technician</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-500 border border-gray-900 inline-block" /> Current site</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white border-2 border-gray-500 inline-block" /> Upcoming site</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-orange-500 inline-block" /> On route</span>
        </div>
      </div>
      <div style={{ height: 360 }}>
        <MapContainer center={center} zoom={allPoints.length ? 12 : 6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {techMarkers.map(u => (
            <Marker key={`tech-${u.technicianId}`} position={[u.lastLat, u.lastLng]} icon={techIcon}>
              <Popup>
                <strong>{u.fullName}</strong><br />
                {u.onJob ? 'On a job' : 'Online'}
              </Popup>
            </Marker>
          ))}
          {routeLines.map(l => (
            <Polyline key={l.key} positions={[l.from, l.to]} pathOptions={{ color: l.color, weight: 3, dashArray: '8 8' }} />
          ))}
          {siteMarkers.map(({ site, point }) => (
            <Marker key={`site-${site.id}`} position={[point.lat, point.lng]} icon={siteIcon(site.color, site.current, site.onRoute)}>
              <Popup>
                <strong>{site.title}</strong><br />
                {site.location}<br />
                {site.current
                  ? 'In progress'
                  : site.onRoute
                  ? '🚐 Technician on route'
                  : `Scheduled ${new Date(site.scheduledStart).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}`}<br />
                {site.technicians.length ? site.technicians.map(t => t.name).join(', ') : 'Unassigned'}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {users.length > 0 && techMarkers.length === 0 && (
        <p className="text-xs text-gray-400 px-5 py-2 border-t border-gray-100">
          No live GPS positions yet — technicians need to allow location access after clocking in.
        </p>
      )}
    </div>
  )
}
