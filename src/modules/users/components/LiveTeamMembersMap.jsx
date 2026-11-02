import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { technicianColor } from '../services/liveUsersService'

const DEFAULT_CENTER = [-26.2041, 28.0473] // Johannesburg, roughly the middle of the map when nothing else is known

// A dot in the colour of the technician who clocked them in, so the pins on the
// map match the "Clocked in by" colour on each card.
function pinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

// Where each clocked-in team member was clocked in: the phone's position at
// that moment, or for a drop-off with no fix the job site itself.
function teamMemberPoint(m) {
  if (m.lat != null && m.lng != null) return { lat: m.lat, lng: m.lng }
  if (m.dropOff && m.job?.point) return m.job.point
  return null
}

export default function LiveTeamMembersMap({ members }) {
  const pins = members.map(m => ({ m, point: teamMemberPoint(m) })).filter(p => p.point)
  const center = pins.length ? [pins[0].point.lat, pins[0].point.lng] : DEFAULT_CENTER
  // One legend entry per technician who has people clocked in.
  const legend = [...new Map(members.filter(m => m.clockedBy).map(m => [m.clockedBy.id, m.clockedBy])).values()]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Where they were clocked in</h2>
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          {legend.map(by => (
            <span key={by.id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: technicianColor(by, by.id) }} />
              {by.name}
            </span>
          ))}
        </div>
      </div>
      <div style={{ height: 320 }}>
        <MapContainer center={center} zoom={pins.length ? 12 : 6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pins.map(({ m, point }) => (
            <Marker
              key={m.shiftId}
              position={[point.lat, point.lng]}
              icon={pinIcon(m.clockedBy ? technicianColor(m.clockedBy, m.clockedBy.id) : '#9CA3AF')}
            >
              <Popup>
                <strong>{m.fullName}</strong><br />
                Clocked in {new Date(m.clockIn).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                {m.clockedBy && <> by {m.clockedBy.name}</>}<br />
                {m.dropOff ? `Dropped off${m.siteLabel ? ` at ${m.siteLabel}` : ''}` : 'With the technician'}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {members.length > 0 && pins.length === 0 && (
        <p className="text-xs text-gray-400 px-5 py-2 border-t border-gray-100">
          No clock-in locations were recorded — the technician's phone needs to allow location when they tap Clock in.
        </p>
      )}
    </div>
  )
}
