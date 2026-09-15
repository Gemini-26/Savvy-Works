import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)

  async function load() {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, contact_name, email, phone, mobile, address, city, county, postcode')
      .eq('active', true)
      .order('name')
      .limit(500)
    if (data) setSuppliers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return { suppliers, loading, reload: load }
}
