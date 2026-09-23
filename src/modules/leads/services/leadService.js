import { supabase } from '../../../lib/supabase'
import { nextQuoteNumber } from '../../../shared/utils/generateDocumentNumber'

const PAGE_SIZE = 50

export async function fetchLeads(statusFilter, page = 0) {
  let query = supabase
    .from('leads')
    .select('*, customers(customer_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error, count } = await query
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function fetchLead(id) {
  const { data, error } = await supabase
    .from('leads')
    .select('*, customers(customer_name)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Lead not found.')
  return data
}

export async function createLead(lead) {
  const { error } = await supabase
    .from('leads')
    .insert([lead])

  if (error) throw error
}

export async function updateLead(id, updates) {
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')
}

export async function deleteLead(id) {
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Converts a Lead into a new Quote, carrying over customer/site/title, and
// marks the lead as converted — mirrors convertQuoteToJob's quote → job flow.
export async function convertLeadToQuote(lead) {
  const quote_ref = await nextQuoteNumber()

  const { data, error } = await supabase
    .from('quotes')
    .insert([{
      quote_ref,
      quote_number: quote_ref,
      lead_id: lead.id,
      customer_id: lead.customer_id || null,
      title: lead.title || lead.company_name || lead.full_name || null,
      status: 'draft',
      site_address: lead.address,
      site_city: lead.city,
      site_county: lead.county,
      site_postcode: lead.postcode,
    }])
    .select()

  if (error) throw error
  const newQuote = data[0]

  await updateLead(lead.id, { status: 'converted' })

  return newQuote
}

// Looks up the quote a lead was converted into, if any — used to show a
// "View Quote" link on an already-converted lead (leads has no reverse
// quote_id column, unlike jobs.quote_id, so this is a lookup by lead_id).
export async function fetchQuoteForLead(leadId) {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, quote_ref')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (error) throw error
  return data
}
