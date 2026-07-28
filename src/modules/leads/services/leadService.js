import { supabase } from '../../../lib/supabase'

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
