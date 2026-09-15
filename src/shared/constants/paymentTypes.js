export const PAYMENT_TYPES = ['Cash', 'Card', 'EFT', 'Payment Link', 'Account (30-Day)', 'Account (60-Day)', 'Insurance Claim']

// Manually-selectable payment methods for invoices/purchase orders — everything
// in PAYMENT_TYPES except "Payment Link", which on invoices is never picked by
// hand: it's set automatically to "PayFast" the moment the ITN webhook confirms
// a real payment, so it never appears as a manual option here.
export const PAYMENT_METHODS = PAYMENT_TYPES.filter(t => t !== 'Payment Link')
