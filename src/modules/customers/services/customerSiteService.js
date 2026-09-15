import { supabase } from '../../../lib/supabase'

export async function fetchCustomerSites(customerId) {
  if (!customerId) return []
  const { data, error } = await supabase
    .from('customer_sites')
    .select('*')
    .eq('customer_id', customerId)
    .order('site_name')

  if (error) throw error
  return data
}

export async function createCustomerSite(customerId, site) {
  const { data, error } = await supabase
    .from('customer_sites')
    .insert([{ ...site, customer_id: customerId }])
    .select()

  if (error) throw error
  return data[0]
}
