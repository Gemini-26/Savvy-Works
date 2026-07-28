import { supabase } from '../../../lib/supabase'

const PAGE_SIZE = 50

export async function fetchCustomers(status, page = 0, search = '') {
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('customer_name')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,email.ilike.%${search}%,telephone.ilike.%${search}%,mobile.ilike.%${search}%`)
  }

  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function fetchCustomer(id) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Customer not found.')
  return data
}

export async function createCustomer(customer) {
  const { error } = await supabase
    .from('customers')
    .insert([customer])

  if (error) throw error
}

export async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')
}

export async function deleteCustomer(id) {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)

  if (error) throw error
}
