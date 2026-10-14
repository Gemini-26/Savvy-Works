import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation } from 'lucide-react'
import { directionsUrl } from '../../../shared/utils/mapLinks'
import { DEFAULT_RADIUS_M, isSitePinConfirmed } from '../../../shared/utils/siteLocation'

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#DC2626;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.45);transform:rotate(-45deg)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 26],
})

// The site address as one line for a maps search. Addresses are typed free-form,
// so they can carry line breaks and doubled commas.
function addressLine(job) {
  return [job.site_address, job.site_city, job.site_county, job.site_postcode]
    .filter(Boolean)
    .join(', ')
    .replace(/\s*\n\s*/g, ', ')
    .replace(/,(\s*,)+/g, ',')
    .trim()
}

// How a technician gets to the job: a "Take me there" button that opens their
// phone's maps app, and — when an admin has confirmed the site's pin — a small map
// of the spot with the on-site area used to check clock-ins.
//
// An approximate pin (street or suburb level) is deliberately not shown or navigated
// to: it can be hundreds of metres from the real house. Directions then use the typed
// address instead, and the card says the pin isn't confirmed yet.
export default function SiteLocationCard({ job }) {
  const confirmed = isSitePinConfirmed(job)
  const address = addressLine(job)
  if (!confirmed && !address) return null

  const radius = job.site_radius_m ?? DEFAULT_RADIUS_M
  const destination = confirmed ? { lat: job.site_lat, lng: job.site_lng } : address

  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <a
        href={directionsUrl(destination)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg"
      >
        <Navigation size={16} /> Take me there
      </a>

      {confirmed ? (
        <>
          {/* `isolate` keeps the map's own layers from floating above the page's sticky header. */}
          <div className="isolate rounded-lg border border-gray-200 overflow-hidden" style={{ height: 180 }}>
            <MapContainer
              center={[job.site_lat, job.site_lng]}
              zoom={16}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
              // One finger should scroll the page, not drag the map; pinch still zooms it.
              dragging={!L.Browser.mobile}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Circle
                center={[job.site_lat, job.site_lng]}
                radius={radius}
                pathOptions={{ color: '#DC2626', weight: 2, dashArray: '6 6', fillColor: '#DC2626', fillOpacity: 0.08 }}
              />
              <Marker position={[job.site_lat, job.site_lng]} icon={pinIcon} />
            </MapContainer>
          </div>
          <p className="text-[11px] text-gray-500">
            {job.site_geo_source === 'pin' ? 'Site location confirmed by your admin.' : 'Site location matched to the address.'}
            {' '}The dashed circle is the on-site area ({radius} m) used to check clock-ins.
          </p>
        </>
      ) : (
        <p className="text-[11px] text-amber-700">
          Your admin hasn’t confirmed this site’s map pin yet, so directions use the address and may not land on the exact spot.
        </p>
      )}
    </div>
  )
}
