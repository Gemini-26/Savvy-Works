const ZAR = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })
const ZAR_NO_SYMBOL = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatCurrency(amount) {
  return ZAR.format(Number(amount) || 0)
}

// "R 1 234.56" → "R 1.2k" for dashboard cards
export function formatCurrencyCompact(amount) {
  const n = Number(amount) || 0
  if (Math.abs(n) >= 1_000_000) return `R ${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `R ${(n / 1_000).toFixed(1)}k`
  return ZAR.format(n)
}

// Just the number, no symbol — for inputs that have a separate "R" prefix
export function formatAmount(amount) {
  return ZAR_NO_SYMBOL.format(Number(amount) || 0)
}

// Parse a currency string or numeric input back to a float
export function parseCurrency(value) {
  if (value === null || value === undefined || value === '') return 0
  const cleaned = String(value).replace(/[^0-9.-]/g, '')
  return parseFloat(cleaned) || 0
}
