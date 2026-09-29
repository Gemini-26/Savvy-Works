import { supabase } from '../../../lib/supabase'
import { lineItemRow } from '../../../shared/utils/lineItemRow'
import { replaceLineItems } from '../../../shared/services/lineItemsService'
import { JOB_ASSIGNEES_SELECT, jobAssignees, jobIdsForStaffNamed } from '../../../shared/utils/assignees'
import { buildFilters, keywordGroups } from '../../../shared/utils/listFilters'
import { nextPurchaseOrderNumber } from '../../../shared/utils/generateDocumentNumber'

const PAGE_SIZE = 50

// Everything the Keywords box and the search bar look through: every text
// field on the PO, plus its customer, linked job / quote / invoice, the job's
// staff, and its line items.
const PO_KEYWORDS = {
  columns: [
    'po_ref', 'title', 'supplier_name', 'reference', 'status', 'payment_method',
    'notes', 'terms', 'delivery_notes', 'supplier_notes',
  ],
  related: [
    { column: 'customer_id', lookup: ['customers', ['customer_name']] },
    { column: 'job_id',      lookup: ['jobs', ['job_ref', 'title']] },
    { column: 'job_id',      resolve: jobIdsForStaffNamed },
    { column: 'quote_id',    lookup: ['quotes', ['quote_ref']] },
    { column: 'invoice_id',  lookup: ['invoices', ['invoice_ref']] },
    { column: 'id',          lookup: ['purchase_order_items', ['description'], 'purchase_order_id'] },
  ],
}

const PO_FILTERS = {
  poRef:            { columns: ['po_ref'] },
  supplier:         { columns: ['supplier_name'] },
  title:            { columns: ['title'] },
  reference:        { columns: ['reference'] },
  customer:         { column: 'customer_id', lookup: ['customers', ['customer_name']] },
  jobRef:           { column: 'job_id', lookup: ['jobs', ['job_ref']] },
  quoteRef:         { column: 'quote_id', lookup: ['quotes', ['quote_ref']] },
  invoiceRef:       { column: 'invoice_id', lookup: ['invoices', ['invoice_ref']] },
  keywords:         { type: 'keywords', ...PO_KEYWORDS },
  status:           { column: 'status', type: 'multi' },
  paymentMethod:    { column: 'payment_method', type: 'multi' },
  issued:           { column: 'issue_date', type: 'dateRange' },
  due:              { column: 'due_date', type: 'dateRange' },
  expectedDelivery: { column: 'expected_delivery_date', type: 'dateRange' },
  total:            { column: 'total', type: 'numberRange' },
}

export async function fetchPurchaseOrders(statusFilter, page = 0, search = '', filters = {}) {
  let query = supabase
    .from('purchase_orders')
    .select(`*, jobs(${JOB_ASSIGNEES_SELECT})`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const orGroups = await keywordGroups(search, PO_KEYWORDS)

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const applyFilters = await buildFilters(PO_FILTERS, filters)
  query = applyFilters(query, orGroups)

  const { data, error, count } = await query
  if (error) throw error
  return { data: (data ?? []).map(po => ({ ...po, assignees: jobAssignees(po.jobs) })), count, page, pageSize: PAGE_SIZE }
}

export async function fetchPurchaseOrder(id) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`*, purchase_order_items(*),
      suppliers(name, contact_name, email, phone, mobile, address, city, county, postcode),
      customers(customer_name),
      customer_sites(site_name, address_line_1, city, province, postal_code),
      quotes(quote_ref, title),
      jobs(job_ref, title),
      invoices(invoice_ref, title)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Purchase order not found.')
  data.purchase_order_items?.sort((a, b) => a.sort_order - b.sort_order)
  return data
}

// Computes subtotal / tax_total / total from a list of line items
export function calculateTotals(items) {
  let subtotal = 0
  let taxTotal = 0
  for (const it of items) {
    const lineSubtotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
    subtotal += lineSubtotal
    taxTotal += lineSubtotal * ((Number(it.tax_rate) || 0) / 100)
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax_total: Math.round(taxTotal * 100) / 100,
    total: Math.round((subtotal + taxTotal) * 100) / 100,
  }
}

function itemRows(purchaseOrderId, items) {
  return items.map((it, i) => ({ purchase_order_id: purchaseOrderId, ...lineItemRow(it, i) }))
}

export async function createPurchaseOrder(po, items) {
  const po_ref = await nextPurchaseOrderNumber()
  const totals = calculateTotals(items)

  const { data, error } = await supabase
    .from('purchase_orders')
    .insert([{ ...po, po_ref, ...totals }])
    .select()

  if (error) throw error
  const newPO = data[0]

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemRows(newPO.id, items))
    if (itemsError) throw itemsError
  }

  return newPO
}

export async function updatePurchaseOrder(id, updates, items) {
  const totals = items ? calculateTotals(items) : {}

  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ ...updates, ...totals, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')

  if (items) await replaceLineItems('purchase_order_items', 'purchase_order_id', id, items)
}

export async function deletePurchaseOrder(id) {
  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', id)

  if (error) throw error
}
