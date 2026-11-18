// "082 123 4567" / "+27 82 123 4567" → "27821234567" (what wa.me wants), or null
// when the number is not one we can be sure of. South African numbers only.
export function whatsappNumber(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (/^0\d{9}$/.test(digits)) return `27${digits.slice(1)}`
  if (/^27\d{9}$/.test(digits)) return digits
  if (/^0027\d{9}$/.test(digits)) return digits.slice(2)
  return null
}
