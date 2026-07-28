import { supabase } from '../../../lib/supabase'
import { nextPurchaseOrderNumber } from '../../../shared/utils/generateDocumentNumber'

const PAGE_SIZE = 50

export async function fetchPurchaseOrders(statusFilter, page = 0) {
  let query = supabase
    .from('purchase_orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { data, count, page, pageSize: PAGE_SIZE }
}

export async function fetchPurchaseOrder(id) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, purchase_order_items(*)')
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
  return items.map((it, i) => ({
    purchase_order_id: purchaseOrderId,
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

  if (items) {
    const { error: delError } = await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id)
    if (delError) throw delError

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemRows(id, items))
      if (itemsError) throw itemsError
    }
  }
}

export async function deletePurchaseOrder(id) {
  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', id)

  if (error) throw error
}
