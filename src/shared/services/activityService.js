import { supabase } from '../../lib/supabase'
import { getCurrentProfile } from '../../services/authService'

export async function logActivity(jobId, action, detail = null) {
  const profile = await getCurrentProfile().catch(() => null)
  const { error } = await supabase.from('job_activity').insert([{
    job_id:     jobId,
    actor_id:   profile?.id || null,
    actor_name: profile?.full_name || 'System',
    action,
    detail,
  }])
  if (error) throw error
}

export async function fetchJobActivity(jobId) {
  const { data, error } = await supabase
    .from('job_activity')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
