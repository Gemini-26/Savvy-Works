import { supabase } from '../../../lib/supabase'
import { lineItemRow } from '../../../shared/utils/lineItemRow'
import { replaceLineItems } from '../../../shared/services/lineItemsService'
import { buildFilters, keywordGroups } from '../../../shared/utils/listFilters'
import { nextQuoteNumber, nextJobNumber } from '../../../shared/utils/generateDocumentNumber'

const PAGE_SIZE = 50

// Everything the Keywords box and the search bar look through: every text
// field on the quote, plus its customer, assigned person, linked job / lead,
// and its line items.
const QUOTE_KEYWORDS = {
  columns: [
    'quote_ref', 'quote_number', 'title', 'status',
    'site_address', 'site_city', 'site_county', 'site_postcode', 'notes', 'terms',
  ],
  related: [
    { column: 'customer_id', lookup: ['customers', ['customer_name', 'email', 'telephone', 'mobile']] },
    { column: 'assigned_to', lookup: ['profiles', ['full_name']] },
    { column: 'job_id',      lookup: ['jobs', ['job_ref', 'title']] },
    { column: 'lead_id',     lookup: ['leads', ['lead_ref', 'full_name', 'company_name']] },
    { column: 'id',          lookup: ['quote_items', ['description'], 'quote_id'] },
  ],
}

const QUOTE_FILTERS = {
  quoteRef:    { columns: ['quote_ref', 'quote_number'] },
  customer:    { column: 'customer_id', lookup: ['customers', ['customer_name', 'email', 'telephone', 'mobile']] },
  title:       { columns: ['title'] },
  siteAddress: { columns: ['site_address', 'site_city', 'site_postcode'] },
  jobRef:      { column: 'job_id', lookup: ['jobs', ['job_ref']] },
  leadRef:     { column: 'lead_id', lookup: ['leads', ['lead_ref']] },
  keywords:    { type: 'keywords', ...QUOTE_KEYWORDS },
  status:      { column: 'status', type: 'multi' },
  technician:  { column: 'assigned_to', type: 'multi' },
  province:    { column: 'site_county', type: 'multi' },
  issued:      { column: 'issue_date', type: 'dateRange' },
  validUntil:  { column: 'valid_until', type: 'dateRange' },
  created:     { column: 'created_at', type: 'dateRange', timestamp: true },
  total:       { column: 'total', type: 'numberRange' },
}

export async function fetchQuotes(statusFilter, page = 0, search = '', filters = {}) {
  let query = supabase
    .from('quotes')
    .select('*, customers(customer_name), profiles(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const orGroups = []
  orGroups.push(...await keywordGroups(search, QUOTE_KEYWORDS))

  if (statusFilter) query = query.eq('status', statusFilter)
  const applyFilters = await buildFilters(QUOTE_FILTERS, filters)
  query = applyFilters(query, orGroups)

  const { data, error, count } = await query
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function fetchQuote(id) {
  const { data, error } = await supabase
    .from('quotes')
    .select('*, customers(customer_name, email, telephone, mobile), profiles(full_name), quote_items(*), leads!lead_id(lead_ref)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Quote not found.')
  data.quote_items?.sort((a, b) => a.sort_order - b.sort_order)
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

export async function createQuote(quote, items) {
  const quote_ref = await nextQuoteNumber()
  const totals = calculateTotals(items)

  const { data, error } = await supabase
    .from('quotes')
    .insert([{ ...quote, quote_ref, quote_number: quote_ref, ...totals }])
    .select()

  if (error) throw error
  const newQuote = data[0]

  if (items.length > 0) {
    const rows = items.map((it, i) => ({ quote_id: newQuote.id, ...lineItemRow(it, i) }))
    const { error: itemsError } = await supabase.from('quote_items').insert(rows)
    if (itemsError) throw itemsError
  }

  return newQuote
}

export async function updateQuote(id, updates, items) {
  const totals = items ? calculateTotals(items) : {}

  const { data, error } = await supabase
    .from('quotes')
    .update({ ...updates, ...totals })
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')

  if (items) await replaceLineItems('quote_items', 'quote_id', id, items)
}

export async function deleteQuote(id) {
  const { error } = await supabase
    .from('quotes')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Converts an accepted quote into a Job, carrying over customer/site/title/technician.
export async function convertQuoteToJob(quote) {
  const job_ref = await nextJobNumber()

  const { data, error } = await supabase
    .from('jobs')
    .insert([{
      job_ref,
      quote_id: quote.id,
      customer_id: quote.customer_id,
      assigned_to: quote.assigned_to || null,
      title: quote.title,
      status: 'unassigned',
      priority: 'medium',
      site_address: quote.site_address,
      site_city: quote.site_city,
      site_county: quote.site_county,
      site_postcode: quote.site_postcode,
      notes: quote.notes,
    }])
    .select()

  if (error) throw error
  const newJob = data[0]

  const { data: quoteItems, error: itemsError } = await supabase
    .from('quote_items')
    .select('item_id, description, quantity, unit, unit_price, tax_rate, line_total, sort_order')
    .eq('quote_id', quote.id)
    .order('sort_order')
  if (itemsError) throw itemsError

  if (quoteItems?.length > 0) {
    const rows = quoteItems.map(it => ({ ...it, job_id: newJob.id }))
    const { error: insertError } = await supabase.from('job_items').insert(rows)
    if (insertError) throw insertError
  }

  await updateQuote(quote.id, { status: 'converted' })

  return newJob
}
