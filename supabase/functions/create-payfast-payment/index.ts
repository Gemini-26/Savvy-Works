import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import md5 from 'https://esm.sh/js-md5@0.8.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const payfastMerchantId  = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
const payfastMerchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY') ?? ''
const payfastPassphrase  = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
const payfastProcessUrl  = Deno.env.get('PAYFAST_PROCESS_URL') ?? 'https://sandbox.payfast.co.za/eng/process'
const appUrl             = Deno.env.get('APP_URL') ?? ''
const itnUrl              = Deno.env.get('PAYFAST_ITN_URL') ?? ''

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// PayFast's signature spec is PHP's urlencode(), not JS's encodeURIComponent —
// they differ on !'()* and ~, which encodeURIComponent leaves unescaped but
// urlencode() percent-encodes. Left unpatched, any field containing one of
// those (a company name with "(Pty) Ltd" in it, for example) produces a
// signature PayFast's own recomputation won't match, and it's rejected.
function payfastEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function buildSignature(fields: Record<string, string>, passphrase: string): string {
  const pairs = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${payfastEncode(String(v))}`)

  let paramString = pairs.join('&')
  if (passphrase) {
    paramString += `&passphrase=${payfastEncode(passphrase)}`
  }

  return paramString
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!serviceRoleKey || !supabaseUrl || !payfastMerchantId || !payfastMerchantKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve the caller's own company + profile — used below to scope the
    // invoice lookup and to attribute the audit trail (invoice_events) to a
    // real person, not just "someone logged in".
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('id, company_id, full_name')
      .eq('auth_user_id', caller.id)
      .maybeSingle()

    if (callerProfileError || !callerProfile?.company_id) {
      return new Response(JSON.stringify({ error: 'Your account is not linked to a company.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { invoice_id } = await req.json()
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Scoped to the caller's own company — without this, any authenticated
    // user on this Supabase project (any tenant) could pass another
    // company's invoice_id and generate a valid payment link against it,
    // since this function runs with the service-role key and would
    // otherwise bypass the invoices table's RLS entirely.
    const { data: invoice, error: invoiceError } = await adminClient
      .from('invoices')
      .select('id, invoice_ref, title, total, company_id, customers ( customer_name, email )')
      .eq('id', invoice_id)
      .eq('company_id', callerProfile.company_id)
      .maybeSingle()

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const amount = Number(invoice.total ?? 0).toFixed(2)
    if (Number(amount) <= 0) {
      return new Response(JSON.stringify({ error: 'This invoice has no priced items yet, so there is nothing to charge — add line items with a price before generating a payment link.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // m_payment_id must be unique per attempt so PayFast/ITN can be matched back
    // to this invoice unambiguously. Each attempt gets its own row (rather than
    // overwriting a single column on the invoice) so an earlier link a customer
    // still has open keeps working even after a newer link is generated —
    // otherwise a payment made against the old link would arrive with an
    // m_payment_id nothing recognizes, and silently never mark the invoice paid.
    const mPaymentId = `${invoice.invoice_ref ?? invoice.id}-${Date.now()}`

    const { error: attemptError } = await adminClient
      .from('invoice_payment_attempts')
      .insert({
        company_id: callerProfile.company_id,
        invoice_id: invoice.id,
        m_payment_id: mPaymentId,
        amount: Number(amount),
        created_by: callerProfile.id,
      })

    if (attemptError) {
      console.error('Failed to record payment attempt:', attemptError)
      return new Response(JSON.stringify({ error: 'Failed to prepare payment link' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await adminClient.from('invoice_events').insert({
      company_id: callerProfile.company_id,
      invoice_id: invoice.id,
      event_type: 'link_generated',
      actor_id: callerProfile.id,
      actor_name: callerProfile.full_name,
      detail: `Payment link generated for R${amount}`,
    })

    // Fields with an empty value are omitted entirely (not sent as "") — PayFast
    // computes its own signature from whatever fields it actually receives, so a
    // field we send but exclude from our signature (e.g. a customer with no email
    // on file) causes a mismatch on their side even though our own math is
    // internally consistent. Only ever sending what we sign keeps the two in sync.
    const allFields: Record<string, string | undefined> = {
      merchant_id: payfastMerchantId,
      merchant_key: payfastMerchantKey,
      return_url: `${appUrl}/finance/invoices/${invoice_id}?payment=success`,
      cancel_url: `${appUrl}/finance/invoices/${invoice_id}?payment=cancelled`,
      notify_url: itnUrl,
      name_first: invoice.customers?.customer_name || 'Customer',
      email_address: invoice.customers?.email || undefined,
      m_payment_id: mPaymentId,
      amount,
      item_name: invoice.title || invoice.invoice_ref || `Invoice ${invoice_id}`,
    }

    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(allFields)) {
      if (v !== undefined && v !== null && v !== '') fields[k] = v
    }

    const paramString = buildSignature(fields, payfastPassphrase)
    const signature = md5(paramString)

    return new Response(JSON.stringify({
      process_url: payfastProcessUrl,
      fields: { ...fields, signature },
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
