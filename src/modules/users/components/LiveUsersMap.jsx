import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geocodeAddress } from '../../../shared/utils/geocode'

const techIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#3B82F6;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})
const jobIcon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;border-radius:2px;background:#F59E0B;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

const DEFAULT_CENTER = [-26.2041, 28.0473] // Johannesburg, roughly the middle of the map when nothing else is known
const RECENT_MS = 15 * 60 * 1000 // a GPS fix older than this is stale, not "live"

// Geocodes each visible job-site address once and caches the result for
// the life of this mount — addresses repeat often (same site, many jobs).
function useGeocodedJobSites(users) {
  const [points, setPoints] = useState({})

  useEffect(() => {
    const addresses = [...new Set(users.map(u => u.currentJob?.location).filter(Boolean))]
    addresses.forEach(async (address) => {
      if (points[address] !== undefined) return
      const point = await geocodeAddress(address)
      setPoints(prev => (prev[address] !== undefined ? prev : { ...prev, [address]: point }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users])

  return points
}

export default function LiveUsersMap({ users }) {
  const jobSitePoints = useGeocodedJobSites(users)

  const techMarkers = users.filter(u => u.lastLat != null && u.lastLng != null && u.lastLocationAgeMs < RECENT_MS)
  const jobMarkers = users
    .filter(u => u.currentJob?.location && jobSitePoints[u.currentJob.location])
    .map(u => ({ user: u, point: jobSitePoints[u.currentJob.location] }))

  const allPoints = [
    ...techMarkers.map(u => [u.lastLat, u.lastLng]),
    ...jobMarkers.map(m => [m.point.lat, m.point.lng]),
  ]
  const center = allPoints.length ? allPoints[0] : DEFAULT_CENTER

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Live Map</h2>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Technician</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Job site</span>
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
          {jobMarkers.map(({ user, point }) => (
            <Marker key={`job-${user.technicianId}`} position={[point.lat, point.lng]} icon={jobIcon}>
              <Popup>
                <strong>{user.currentJob.title ?? user.currentJob.ref}</strong><br />
                {user.currentJob.location}<br />
                Assigned to {user.fullName}
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
