import { supabase } from '../../../lib/supabase'

const PAGE_SIZE = 50

export async function fetchItems({ activeOnly, categoryId, itemType, search } = {}, page = 0) {
  let query = supabase
    .from('items')
    .select('*, item_categories(name)', { count: 'exact' })
    .order('name')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (activeOnly !== undefined) query = query.eq('active', activeOnly)
  if (categoryId)               query = query.eq('category_id', categoryId)
  if (itemType)                 query = query.eq('item_type', itemType)
  if (search)                   query = query.or(`name.ilike.%${search}%,item_code.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function fetchItem(id) {
  const { data, error } = await supabase
    .from('items')
    .select('*, item_categories(name)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Item not found.')
  return data
}

export async function createItem(item) {
  const { error } = await supabase
    .from('items')
    .insert([item])

  if (error) throw error
}

export async function updateItem(id, updates) {
  const { data, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error('Update failed — no rows were changed. Check your permissions.')
}

export async function deleteItem(id) {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function fetchCategories() {
  const { data, error } = await supabase
    .from('item_categories')
    .select('*')
    .order('name')

  if (error) throw error
  return data
}

export async function createCategory(name) {
  const { error } = await supabase
    .from('item_categories')
    .insert([{ name }])

  if (error) throw error
}

export async function deleteCategory(id) {
  const { error } = await supabase
    .from('item_categories')
    .delete()
    .eq('id', id)

  if (error) throw error
}
