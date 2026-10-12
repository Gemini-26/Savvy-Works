import { formatDistance } from './geo'

// The verdicts the database gives a clock-in / clock-out position (see
// geo_fence_check in the site_geofence migration), in plain words. `tone`
// drives the colour; only 'amber' is an actual flag.
export const GEO_STATUS = {
  inside:        { tone: 'green' },
  outside:       { tone: 'amber' },
  unverified:    { tone: 'gray' },
  low_accuracy:  { tone: 'gray' },
  no_gps:        { tone: 'gray' },
  no_site_pin:   { tone: 'gray' },
  admin_entered: { tone: 'gray' },
}

// Admin-facing wording.
export function describeGeoCheck(status, distanceM, fenceM) {
  switch (status) {
    case 'inside':
      return distanceM != null ? `At the site (${formatDistance(distanceM)} from the pin)` : 'At the site'
    case 'outside':
      return `${formatDistance(distanceM)} from the site (fence is ${fenceM} m)`
    case 'unverified':
      return `${formatDistance(distanceM)} from the site, but the site pin isn't confirmed, so not flagged`
    case 'low_accuracy':
      return "Phone's location was too vague to check"
    case 'no_gps':
      return 'Location was not shared'
    case 'no_site_pin':
      return 'The job has no site location to check against'
    case 'admin_entered':
      return 'Entered by an admin, so not checked'
    default:
      return null
  }
}

// Technician-facing wording for right after they clock in / out. Says nothing
// when all is well.
export function technicianGeoNotice(geo, verb) {
  if (!geo) return null
  switch (geo.status) {
    case 'outside':
      return {
        tone: 'amber',
        text: `You ${verb} about ${formatDistance(geo.distance)} from the job site. It has been recorded and marked for your admin to review. If you're at the right place, you don't need to do anything.`,
      }
    case 'no_gps':
      return {
        tone: 'gray',
        text: `Your location wasn't shared, so we couldn't confirm you ${verb} at the site. Turn on location for this app so it can.`,
      }
    default:
      return null
  }
}

// A visit needs an admin's attention: either end was outside the fence and
// nobody has looked at it yet.
export function isGeoFlagged(assignment) {
  return (assignment.start_geo_status === 'outside' || assignment.end_geo_status === 'outside') && !assignment.geo_reviewed_at
}
