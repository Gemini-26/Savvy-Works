import { supabase } from '../../../lib/supabase'

// Aggregates everything a single user has done across the app into one
// chronological timeline: logins, password changes, work-shift clock
// in/out, and job accept/decline responses.
export async function fetchUserActivityLog(profileId) {
  const [logins, passwordEvents, shifts, jobResponses, toolEvents] = await Promise.all([
    fetchLoginEvents(profileId),
    fetchPasswordEvents(profileId),
    fetchShiftEvents(profileId),
    fetchJobResponseEvents(profileId),
    fetchToolEvents(profileId),
  ])

  return [...logins, ...passwordEvents, ...shifts, ...jobResponses, ...toolEvents]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
}

async function fetchLoginEvents(profileId) {
  const { data, error } = await supabase
    .from('login_events')
    .select('*')
    .eq('profile_id', profileId)
    .order('logged_in_at', { ascending: false })
    .limit(100)
  if (error) throw error

  return (data || []).map(row => ({
    id: `login-${row.id}`,
    category: 'login',
    label: 'Logged in',
    detail: null,
    at: row.logged_in_at,
  }))
}

async function fetchPasswordEvents(profileId) {
  const { data, error } = await supabase
    .from('password_change_requests')
    .select('*')
    .eq('profile_id', profileId)
    .order('requested_at', { ascending: false })
    .limit(100)
  if (error) throw error

  const events = []
  for (const row of data || []) {
    events.push({
      id: `pwreq-${row.id}`,
      category: 'password',
      label: 'Requested a password change',
      detail: null,
      at: row.requested_at,
    })
    if (row.status === 'completed' && row.resolved_at) {
      events.push({
        id: `pwdone-${row.id}`,
        category: 'password',
        label: 'Password changed by admin',
        detail: null,
        at: row.resolved_at,
      })
    }
  }
  return events
}

async function fetchShiftEvents(profileId) {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*')
    .eq('technician_id', profileId)
    .order('clock_in', { ascending: false })
    .limit(100)
  if (error) throw error

  const events = []
  for (const row of data || []) {
    events.push({
      id: `clockin-${row.id}`,
      category: 'clock',
      label: 'Clocked in for the day',
      detail: null,
      at: row.clock_in,
    })
    if (row.clock_out) {
      events.push({
        id: `clockout-${row.id}`,
        category: 'clock',
        label: 'Clocked out for the day',
        detail: null,
        at: row.clock_out,
      })
    }
  }
  return events
}

async function fetchJobResponseEvents(profileId) {
  const { data, error } = await supabase
    .from('job_activity')
    .select('*')
    .eq('actor_id', profileId)
    .in('action', ['technician_accepted', 'technician_declined'])
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error

  return (data || []).map(row => ({
    id: `job-${row.id}`,
    category: 'job',
    label: row.action === 'technician_accepted' ? 'Accepted a job' : 'Declined a job',
    detail: row.detail,
    at: row.created_at,
  }))
}

// Every tool checkout/return this user was on either side of.
async function fetchToolEvents(profileId) {
  const { data, error } = await supabase
    .from('asset_checkout_log')
    .select('*, assets(name), from_profile:from_id(full_name), to_profile:to_id(full_name)')
    .or(`from_id.eq.${profileId},to_id.eq.${profileId}`)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error

  return (data || []).map(row => {
    const isRecipient = row.to_id === profileId
    const label = row.action === 'checked_out'
      ? (isRecipient ? `Checked out "${row.assets?.name}"` : `Lent "${row.assets?.name}" to ${row.to_profile?.full_name || 'a colleague'}`)
      : `Returned "${row.assets?.name}"`
    const detail = row.action === 'checked_out'
      ? (row.comment_out || (row.condition_out ? `Condition: ${row.condition_out}` : null))
      : (row.comment_in || (row.condition_in ? `Condition: ${row.condition_in}` : null))
    return {
      id: `tool-${row.id}`,
      category: 'tools',
      label,
      detail,
      at: row.created_at,
    }
  })
}
