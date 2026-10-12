// Defaults and limits for a job's site location (its saved position and the
// fence radius used by the clock-in location check). Kept apart from the
// picker component so forms can import them without pulling in the map.
export const DEFAULT_RADIUS_M = 150
export const MIN_RADIUS_M = 25
export const MAX_RADIUS_M = 5000

// Identifies the address a location was worked out for. The address box hands
// this to the map when a suggestion is picked, so the map keeps the picked point
// instead of searching the freshly filled-in address all over again.
export const locationSearchKey = form =>
  [form.site_address, form.site_city, form.site_county, form.site_postcode].map(v => String(v || '').trim()).join('|')

// A job's site location as it sits in a form or row. These are the jobs
// table's own column names, so the picker's patches merge straight into a form.
export const BLANK_SITE_LOCATION = {
  site_lat: null,
  site_lng: null,
  site_radius_m: DEFAULT_RADIUS_M,
  site_geo_source: null,
}
