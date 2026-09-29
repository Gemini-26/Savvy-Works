// A cleared number input in LineItemsEditor holds "" rather than a number,
// and Postgres rejects "" for numeric columns. Coerce blanks to 0 here so
// every document type (quotes, jobs, invoices, POs) saves the same way.
function toNumber(value) {
  const n = Number(value)
  return value === '' || value == null || Number.isNaN(n) ? 0 : n
}

// The columns shared by quote_items, job_items, invoice_items and
// purchase_order_items — callers add their own parent id.
export function lineItemRow(item, index) {
  const quantity = toNumber(item.quantity)
  const unit_price = toNumber(item.unit_price)
  return {
    item_id: item.item_id || null,
    sort_order: index,
    description: item.description,
    quantity,
    unit: item.unit,
    unit_price,
    tax_rate: toNumber(item.tax_rate),
    line_total: Math.round(quantity * unit_price * 100) / 100,
  }
}
