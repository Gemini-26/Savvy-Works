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
