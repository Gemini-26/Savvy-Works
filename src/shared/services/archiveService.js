import { supabase } from '../../lib/supabase'
import { getCurrentProfile } from '../../services/authService'

// Snapshots a record into the archive log, capturing who deleted it and when.
export async function archiveRecord(entityType, entityId, label, data, reason) {
  const profile = await getCurrentProfile().catch(() => null)
  const { error } = await supabase
    .from('archived_records')
    .insert([{
      entity_type:  entityType,
      entity_id:    entityId,
      entity_label: label || null,
      data,
      reason:       reason || null,
      archived_by:  profile?.id || null,
    }])
  if (error) throw error
}

export async function fetchArchive(entityType) {
  let query = supabase
    .from('archived_records')
    .select('*, profiles(full_name)')
    .order('archived_at', { ascending: false })
  if (entityType) query = query.eq('entity_type', entityType)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Un-archives the live record (clears archived_at/by) and drops the archive log entry.
export async function restoreRecord(record) {
  const table = record.entity_type === 'job' ? 'jobs' : null
  if (!table) throw new Error(`Restore not supported for "${record.entity_type}".`)

  const { error: restoreErr } = await supabase
    .from(table)
    .update({ archived_at: null, archived_by: null })
    .eq('id', record.entity_id)
  if (restoreErr) throw restoreErr

  const { error: deleteErr } = await supabase
    .from('archived_records')
    .delete()
    .eq('id', record.id)
  if (deleteErr) throw deleteErr
}
