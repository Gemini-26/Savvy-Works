import { supabase } from '../../lib/supabase'

// Client-side formatter — for display only, not for generating real numbers
export function formatDocumentNumber(prefix, number) {
  return `${prefix}-${String(number).padStart(5, '0')}`
}

// DB-backed: atomically increments the company counter and returns the next number.
// Calls the next_document_number() Postgres function created in migration 003.
// docType: 'quote' | 'job' | 'invoice' | 'lead'
async function nextNumber(docType) {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id)
    .maybeSingle()

  if (profileErr) throw profileErr
  if (!profile?.company_id) throw new Error('No company linked to your profile.')

  const { data, error } = await supabase
    .rpc('next_document_number', { p_company_id: profile.company_id, p_doc_type: docType })

  if (error) throw error
  return data  // e.g. "Q-00001"
}

export const nextQuoteNumber   = () => nextNumber('quote')
export const nextJobNumber     = () => nextNumber('job')
export const nextInvoiceNumber = () => nextNumber('invoice')
export const nextLeadNumber    = () => nextNumber('lead')
export const nextPurchaseOrderNumber = () => nextNumber('po')
