import { supabase } from '../../../lib/supabase'
import { nextInvoiceNumber } from '../../../shared/utils/generateDocumentNumber'

const PAGE_SIZE = 50

export async function fetchInvoices(statusFilter, page = 0, search = '') {
  let query = supabase
    .from('invoices')
    .select('*, customers(customer_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (search) {
    query = query.or(`title.ilike.%${search}%,invoice_ref.ilike.%${search}%`)
  }

  if (statusFilter === 'outstanding') {
    query = query.not('status', 'in', '("cancelled","paid","draft")')
  } else if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function findInvoiceForJob(jobId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('job_id', jobId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchInvoice(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customers(customer_name, email, telephone, mobile), invoice_items(*), jobs(job_ref, title)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Invoice not found.')
  data.invoice_items?.sort((a, b) => a.sort_order - b.sort_order)
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

function itemRows(invoiceId, items) {
  return items.map((it, i) => ({
    invoice_id: invoiceId,
    item_id: it.item_id || null,
    sort_order: i,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    tax_rate: it.tax_rate,
    line_total: Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100,
  }))
}

export async function createInvoice(invoice, items) {
  const invoice_ref = await nextInvoiceNumber()
  const totals = calculateTotals(items)

  const { data, error } = await supabase
    .from('invoices')
    .insert([{ ...invoice, invoice_ref, invoice_number: invoice_ref, ...totals }])
    .select()

  if (error) throw error
  const newInvoice = data[0]

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from('invoice_items').insert(itemRows(newInvoice.id, items))
    if (itemsError) throw itemsError
  }

  return newInvoice
}

export async function updateInvoice(id, updates, items) {
  const totals = items ? calculateTotals(items) : {}

  const { data, error } = await supabase
    .from('invoices')
    .update({ ...updates, ...totals })
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')

  if (items) {
    const { error: delError } = await supabase.from('invoice_items').delete().eq('invoice_id', id)
    if (delError) throw delError

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('invoice_items').insert(itemRows(id, items))
      if (itemsError) throw itemsError
    }
  }
}

export async function deleteInvoice(id) {
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Creates an invoice from a completed job, carrying over the customer/site/title
// and, if the job came from a quote, that quote's line items.
export async function createInvoiceFromJob(job) {
  const { data: jobItems, error: jobItemsError } = await supabase
    .from('job_items')
    .select('item_id, description, quantity, unit, unit_price, tax_rate')
    .eq('job_id', job.id)
    .order('sort_order')
  if (jobItemsError) throw jobItemsError

  let items = jobItems || []

  // Fallback for jobs converted before job_items existed / weren't backfilled
  if (items.length === 0 && job.quote_id) {
    const { data: quoteItems, error } = await supabase
      .from('quote_items')
      .select('item_id, description, quantity, unit, unit_price, tax_rate')
      .eq('quote_id', job.quote_id)
      .order('sort_order')
    if (error) throw error
    items = quoteItems || []
  }

  const issueDate = new Date().toISOString().split('T')[0]

  const newInvoice = await createInvoice({
    customer_id: job.customer_id,
    job_id: job.id,
    title: job.title,
    status: 'draft',
    issue_date: issueDate,
    site_address: job.site_address,
    site_city: job.site_city,
    site_county: job.site_county,
    site_postcode: job.site_postcode,
  }, items)

  return newInvoice
}
