import { supabase } from '../../lib/supabase'
import { lineItemRow } from '../utils/lineItemRow'

// Replaces a document's line items (quote_items, job_items, invoice_items,
// purchase_order_items). The new rows go in before the old ones are
// removed, so a failed insert leaves the existing lines untouched instead
// of wiping them.
export async function replaceLineItems(table, parentColumn, parentId, items) {
  const { data: existing, error: fetchError } = await supabase.from(table).select('id').eq(parentColumn, parentId)
  if (fetchError) throw fetchError

  if (items.length > 0) {
    const rows = items.map((it, i) => ({ [parentColumn]: parentId, ...lineItemRow(it, i) }))
    const { error: insertError } = await supabase.from(table).insert(rows)
    if (insertError) throw insertError
  }

  const oldIds = (existing || []).map(r => r.id)
  if (oldIds.length > 0) {
    const { error: deleteError } = await supabase.from(table).delete().in('id', oldIds)
    if (deleteError) throw deleteError
  }
}
