import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import md5 from 'https://esm.sh/js-md5@0.8.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Every one of these is trimmed. Secrets are almost always set by pasting into
// a dashboard field or piping a file into `supabase secrets set`, and both
// routinely carry a trailing newline or space along for the ride. An invisible
// stray byte on the passphrase changes the MD5 and PayFast rejects the payment
// with "Generated signature does not match submitted signature" — an error that
// points at the signature code and gives no hint that the real fault is one
// character of whitespace nobody can see in the dashboard.
const env = (name: string, fallback = '') => (Deno.env.get(name) ?? fallback).trim()

const payfastMerchantId  = env('PAYFAST_MERCHANT_ID')
const payfastMerchantKey = env('PAYFAST_MERCHANT_KEY')
const payfastPassphrase  = env('PAYFAST_PASSPHRASE')
const payfastProcessUrl  = env('PAYFAST_PROCESS_URL', 'https://sandbox.payfast.co.za/eng/process')
const appUrl             = env('APP_URL').replace(/\/+$/, '')
const itnUrl              = env('PAYFAST_ITN_URL')

// Set this secret to enable the /diagnose probe below, and unset it to turn the
// probe back off. It exists to answer "are the PayFast secrets on this
// deployment actually the ones the PayFast account expects?" — a question that
// cannot be answered from outside, because secrets are write-only once set.
const payfastDiagToken = env('PAYFAST_DIAG_TOKEN')

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

// PayFast sanitises characters like < and > out of the values it receives
// *before* it recomputes the signature, so a field containing them can never
// match no matter how correctly it was signed on this side — it fails as
// "Generated signature does not match submitted signature", pointing at the
// signing code rather than at the malformed value that actually caused it.
// An unsubstituted placeholder such as https://<your-project-ref>.supabase.co
// is the usual way one gets in. Catching it here turns a misleading gateway
// rejection into a message that names the offending variable.
function urlConfigError(name: string, value: string): string | null {
  if (!value) return null // absent is legal; these fields are optional
  if (/[<>]/.test(value)) {
    return `${name} still contains a placeholder ("${value}"). Replace it with the real URL.`
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return `${name} is not a valid absolute URL ("${value}").`
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `${name} must be an http(s) URL ("${value}").`
  }
  return null
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

  // --- Signature self-test -------------------------------------------------
  // Posts a throwaway, minimum-field payment to PayFast twice: once signed with
  // the configured passphrase and once with no passphrase at all. PayFast
  // answers 200 for the combination that matches the account and 400 for the
  // one that does not, which pins the fault to a specific secret instead of
  // leaving "signature does not match" to be guessed at. Nothing is charged —
  // PayFast only renders its checkout page; no ITN fires and no attempt row is
  // written. Gated on a shared token so it is not an open probe, and the token
  // secret can simply be unset once the configuration is confirmed good.
  if (new URL(req.url).pathname.endsWith('/diagnose')) {
    if (!payfastDiagToken || req.headers.get('x-payfast-diag') !== payfastDiagToken) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const probeFields: Record<string, string> = {
      merchant_id: payfastMerchantId,
      merchant_key: payfastMerchantKey,
      amount: '150.00',
      item_name: 'Signature self-test',
    }

    const probe = async (passphrase: string) => {
      const paramString = buildSignature(probeFields, passphrase)
      const body = new URLSearchParams({ ...probeFields, signature: md5(paramString) })
      try {
        const res = await fetch(payfastProcessUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        })
        const text = await res.text()
        const invalid = text.match(/is invalid:([\s\S]{0,300}?)</i)?.[1]
        return {
          http_status: res.status,
          signature_accepted: !/signature does not match/i.test(text),
          payfast_complaint: invalid ? invalid.replace(/\s+/g, ' ').trim() : null,
        }
      } catch (e) {
        return { http_status: 0, signature_accepted: false, payfast_complaint: `probe failed: ${e.message}` }
      }
    }

    // Describes a secret without ever disclosing it: enough to spot a stray
    // newline, a smart quote pasted from a document, or an empty value.
    const describe = (trimmed: string, raw: string | undefined) => ({
      set: raw !== undefined && raw !== '',
      length: trimmed.length,
      had_surrounding_whitespace: (raw ?? '').length !== trimmed.length,
      has_non_ascii: /[^\x20-\x7E]/.test(trimmed),
    })

    const [withPass, withoutPass] = await Promise.all([probe(payfastPassphrase), probe('')])

    let verdict: string
    if (withPass.signature_accepted) {
      verdict = 'CONFIGURED PASSPHRASE IS CORRECT — signatures validate as configured.'
    } else if (withoutPass.signature_accepted) {
      verdict = payfastPassphrase
        ? 'PASSPHRASE SHOULD BE EMPTY — the PayFast account has no passphrase set, but PAYFAST_PASSPHRASE has a value. Unset that secret, or set a matching passphrase on the PayFast account.'
        : 'NO PASSPHRASE NEEDED — signatures validate with no passphrase.'
    } else {
      verdict = 'NEITHER WORKS — the passphrase is wrong, and/or merchant_id / merchant_key do not belong to the account behind PAYFAST_PROCESS_URL (check sandbox vs live).'
    }

    return new Response(JSON.stringify({
      verdict,
      process_url: payfastProcessUrl,
      is_sandbox: /sandbox/i.test(payfastProcessUrl),
      merchant_id: payfastMerchantId,
      secrets: {
        PAYFAST_MERCHANT_ID:  describe(payfastMerchantId,  Deno.env.get('PAYFAST_MERCHANT_ID')),
        PAYFAST_MERCHANT_KEY: describe(payfastMerchantKey, Deno.env.get('PAYFAST_MERCHANT_KEY')),
        PAYFAST_PASSPHRASE:   describe(payfastPassphrase,  Deno.env.get('PAYFAST_PASSPHRASE')),
        APP_URL:              describe(appUrl,             Deno.env.get('APP_URL')),
        PAYFAST_ITN_URL:      describe(itnUrl,             Deno.env.get('PAYFAST_ITN_URL')),
      },
      probes: { signed_with_configured_passphrase: withPass, signed_with_no_passphrase: withoutPass },
    }, null, 2), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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

    // Checked before the attempt row is written, so a misconfigured deployment
    // fails loudly and leaves nothing half-created behind.
    const configError = urlConfigError('PAYFAST_ITN_URL', itnUrl) ?? urlConfigError('APP_URL', appUrl)
    if (configError) {
      console.error('PayFast configuration error:', configError)
      return new Response(JSON.stringify({
        error: `PayFast is misconfigured and payment links cannot be generated: ${configError}`,
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
