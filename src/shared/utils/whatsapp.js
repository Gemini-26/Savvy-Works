// Builds a wa.me deep link that opens WhatsApp with the message pre-filled —
// no WhatsApp Business API/subscription needed, the sender still taps "Send" themselves.
export function buildWhatsappLink(phone, message) {
  const digits = String(phone || '').replace(/[^0-9]/g, '')
  // South African local numbers start with 0 — wa.me needs the international
  // form (27...) with no leading zero.
  const international = digits.startsWith('0') ? `27${digits.slice(1)}` : digits
  const text = encodeURIComponent(message)
  return international
    ? `https://wa.me/${international}?text=${text}`
    : `https://wa.me/?text=${text}`
}
