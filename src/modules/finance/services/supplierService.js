import { supabase } from '../../../lib/supabase'

const PAGE_SIZE = 50

export async function fetchSuppliers(search = '', page = 0) {
  let query = supabase
    .from('suppliers')
    .select('*', { count: 'exact' })
    .eq('active', true)
    .order('name')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (search) {
    query = query.or(`name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function fetchSupplier(id) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Supplier not found.')
  return data
}

export async function createSupplier(supplier) {
  const { data, error } = await supabase
    .from('suppliers')
    .insert([{ ...supplier, active: true }])
    .select()

  if (error) throw error
  return data[0]
}

export async function updateSupplier(id, updates) {
  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')
  return data[0]
}
