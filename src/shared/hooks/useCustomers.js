import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export function useCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)

  async function load() {
    const { data } = await supabase
      .from('customers')
      .select('id, customer_name, customer_type, email, telephone, mobile')
      .eq('status', 'active')
      .order('customer_name')
      .limit(500)
    if (data) setCustomers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return { customers, loading, reload: load }
}
