import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export function useProfiles(activeOnly = true) {
  const [profiles, setProfiles] = useState([])
  const [loading,  setLoading]  = useState(true)

  async function load() {
    let q = supabase.from('profiles').select('*').order('full_name')
    if (activeOnly) q = q.eq('is_active', true)
    const { data } = await q
    if (data) setProfiles(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [activeOnly])

  return { profiles, loading, reload: load }
}
