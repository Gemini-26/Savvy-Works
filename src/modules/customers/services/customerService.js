import { supabase } from '../../../lib/supabase'
import { normalizePhone } from '../../../shared/utils/phone'

const PAGE_SIZE = 50

export async function fetchCustomers(status, page = 0, search = '') {
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('customer_name')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (search) {
    const terms = [`customer_name.ilike.%${search}%`, `email.ilike.%${search}%`, `telephone.ilike.%${search}%`, `mobile.ilike.%${search}%`]
    // Phones are stored "+27-821234567", so "082 123" should match on "82123".
    const digits = search.replace(/\D/g, '').replace(/^0+/, '')
    if (digits.length >= 3 && /^[\d\s()+-]+$/.test(search)) {
      terms.push(`telephone.ilike.%${digits}%`, `mobile.ilike.%${digits}%`)
    }
    query = query.or(terms.join(','))
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

// Every save path lands phones in the one "+27-821234567" format.
function withNormalizedPhones(record) {
  const out = { ...record }
  for (const key of ['telephone', 'mobile']) {
    if (key in out) out[key] = normalizePhone(out[key]) || null
  }
  return out
}

export async function createCustomer(customer) {
  const { error } = await supabase
    .from('customers')
    .insert([withNormalizedPhones(customer)])

  if (error) throw error
}

export async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update(withNormalizedPhones(updates))
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
