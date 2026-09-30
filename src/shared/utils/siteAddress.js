// A job's site address on one line, city first in brackets so lists can be
// scanned by area: "(Sandton) 12 Main Rd, Unit 4". The street is a textarea,
// so line breaks are folded into commas. `full` adds province and postcode
// (used for tooltips, where there's room).
export function formatSiteAddress(job, { full = false } = {}) {
  if (!job) return ''
  const street = (job.site_address || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', ')
  const city = (job.site_city || '').trim()
  const rest = [street, ...(full ? [job.site_county, job.site_postcode] : [])]
    .map(p => (p || '').trim()).filter(Boolean).join(', ')
  return [city && `(${city})`, rest].filter(Boolean).join(' ')
}
