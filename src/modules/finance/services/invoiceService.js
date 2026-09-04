import { supabase } from '../../../lib/supabase'
import { nextInvoiceNumber } from '../../../shared/utils/generateDocumentNumber'
import { getCurrentProfile } from '../../../services/authService'

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

export async function createPayfastPayment(invoiceId) {
  const { data, error } = await supabase.functions.invoke('create-payfast-payment', {
    body: { invoice_id: invoiceId },
  })
  if (error) {
    // supabase-js wraps non-2xx responses in a generic "Edge Function returned
    // a non-2xx status code" message — the function's actual reason is in the
    // response body, so unwrap it for a message worth showing the user.
    const body = await error.context?.json?.().catch(() => null)
    throw new Error(body?.error || error.message)
  }
  return data
}

// PayFast's process endpoint accepts the signed fields as a query string too,
// so this is the same checkout as the POST form — just shareable as a plain link.
export function buildPayfastPaymentLink({ process_url, fields }) {
  const query = new URLSearchParams(fields).toString()
  return `${process_url}?${query}`
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
//
// Uses the find_or_create_draft_invoice() RPC (migration 018) instead of a plain
// find-then-insert: two technicians (or a double-tap on a slow connection)
// completing the same job at nearly the same moment used to both pass the
// "no invoice yet" check and each insert their own invoice. The RPC takes a
// Postgres advisory lock keyed on the job id, so the second caller waits and
// then gets back the first caller's row instead of creating a duplicate.
export async function createInvoiceFromJob(job) {
  const invoice_ref = await nextInvoiceNumber()
  const issueDate = new Date().toISOString().split('T')[0]

  const { data: invoice, error: rpcError } = await supabase.rpc('find_or_create_draft_invoice', {
    p_job_id: job.id,
    p_company_id: null, // filled server-side by the company_id trigger
    p_customer_id: job.customer_id,
    p_title: job.title,
    p_invoice_ref: invoice_ref,
    p_invoice_number: invoice_ref,
    p_issue_date: issueDate,
    p_site_address: job.site_address,
    p_site_city: job.site_city,
    p_site_county: job.site_county,
    p_site_postcode: job.site_postcode,
  })
  if (rpcError) throw rpcError

  // invoice_items is only empty on a genuinely fresh invoice — an invoice the
  // RPC found (rather than created) may already be fully formed, and must not
  // have its line items duplicated.
  const { count: existingItemCount, error: countError } = await supabase
    .from('invoice_items')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoice.id)
  if (countError) throw countError

  if (existingItemCount === 0) {
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

    if (items.length > 0) {
      await updateInvoice(invoice.id, {}, items)
    }
  }

  return invoice
}

// Global payment transactions list (admin view) — every PayFast payment link
// ever generated, across all invoices, newest first.
export async function fetchPaymentTransactions(statusFilter, page = 0, search = '') {
  let query = supabase
    .from('invoice_payment_attempts')
    .select('*, invoices(invoice_ref, title, customers(customer_name))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error, count } = await query
  if (error) throw error

  let results = data
  if (search) {
    const term = search.toLowerCase()
    results = results.filter(r =>
      r.invoices?.invoice_ref?.toLowerCase().includes(term) ||
      r.invoices?.title?.toLowerCase().includes(term) ||
      r.invoices?.customers?.customer_name?.toLowerCase().includes(term) ||
      r.m_payment_id?.toLowerCase().includes(term)
    )
  }

  return { data: results, count, page, pageSize: PAGE_SIZE }
}

// Audit trail for a single invoice — who generated/sent payment links, and
// what happened to each (paid / failed / refunded).
export async function fetchInvoiceEvents(invoiceId) {
  const { data, error } = await supabase
    .from('invoice_events')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function logInvoiceEvent(invoiceId, eventType, detail) {
  const profile = await getCurrentProfile().catch(() => null)
  const { error } = await supabase.from('invoice_events').insert({
    invoice_id: invoiceId,
    event_type: eventType,
    actor_id: profile?.id || null,
    actor_name: profile?.full_name || 'System',
    detail,
  })
  if (error) throw error
}

export async function sendInvoiceReceiptEmail(invoiceId, pdfBase64) {
  const { data, error } = await supabase.functions.invoke('send-invoice-receipt', {
    body: { invoice_id: invoiceId, pdf_base64: pdfBase64 },
  })
  if (error) {
    const body = await error.context?.json?.().catch(() => null)
    throw new Error(body?.error || error.message)
  }
  return data
}

export async function markInvoiceRefunded(invoiceId, reason) {
  const { error } = await supabase
    .from('invoices')
    .update({ payment_status: 'refunded', refunded_at: new Date().toISOString(), refund_reason: reason || null })
    .eq('id', invoiceId)
  if (error) throw error
  await logInvoiceEvent(invoiceId, 'refunded', reason || null)
}

export async function markInvoiceDisputed(invoiceId, reason) {
  const { error } = await supabase
    .from('invoices')
    .update({ payment_status: 'disputed' })
    .eq('id', invoiceId)
  if (error) throw error
  await logInvoiceEvent(invoiceId, 'disputed', reason || null)
}
