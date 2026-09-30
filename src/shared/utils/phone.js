// One phone format everywhere: "+27-821234567" — country code, a dash, then
// the national number with its trunk 0 dropped and no spaces.
//
// Accepts whatever people typed or older records hold: "082 123 4567",
// "0821234567", "821234567", "27821234567", "+27-0821234567",
// "+27 82 123 4567", "+263-771234567". Anything that isn't a phone number
// (e.g. an email typed into the field) is returned unchanged so no data is
// lost. Blank, or a bare code like "+27-", returns ''.
const KNOWN_CODES = ['+263', '+264', '+266', '+267', '+268', '+258', '+27']

export function normalizePhone(raw, defaultCode = '+27') {
  if (raw == null) return ''
  const value = String(raw).trim()
  if (!value) return ''
  if (value.includes('@')) return value

  let code = defaultCode
  let rest = value
  const known = KNOWN_CODES.find(c => value.startsWith(c))
  if (known) {
    code = known
    rest = value.slice(known.length)
  } else if (value.startsWith('+')) {
    // Some other international number — keep it as typed.
    return value
  }

  let digits = rest.replace(/\D/g, '')
  // "27821234567" typed without the plus.
  if (!known && code === '+27' && digits.length === 11 && digits.startsWith('27')) digits = digits.slice(2)
  digits = digits.replace(/^0+/, '')
  return digits ? `${code}-${digits}` : ''
}
