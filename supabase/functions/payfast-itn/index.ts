import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import md5 from 'https://esm.sh/js-md5@0.8.3'

// PayFast's ITN posts application/x-www-form-urlencoded, server-to-server —
// there is no browser CORS involved, so no corsHeaders needed here.

const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const payfastPassphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
const payfastMerchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
const payfastValidateUrl = Deno.env.get('PAYFAST_VALIDATE_URL') ?? 'https://sandbox.payfast.co.za/eng/query/validate'

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// PayFast's signature spec is PHP's urlencode(), not JS's encodeURIComponent —
// they differ on !'()* and ~, which encodeURIComponent leaves unescaped but
// urlencode() percent-encodes. Must match create-payfast-payment's encoding
// exactly, or a field containing one of those characters (e.g. a company
// name with "(Pty) Ltd" in it) verifies against the wrong string.
function payfastEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

// Unlike the outbound checkout request (where empty fields are omitted),
// PayFast's ITN payload signs every field it sent, in the order it sent them,
// including ones with empty values — so verification must mirror that exactly,
// only excluding the `signature` field itself.
function buildSignature(fields: Record<string, string>, passphrase: string): string {
  const pairs = Object.entries(fields)
    .filter(([k, v]) => k !== 'signature' && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${payfastEncode(String(v))}`)

  let paramString = pairs.join('&')
  if (passphrase) {
    paramString += `&passphrase=${payfastEncode(passphrase)}`
  }
  return paramString
}

async function notifyAdmins(companyId: string, title: string, body: string, link: string) {
  const { data: admins } = await adminClient
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .eq('is_active', true)

  if (!admins?.length) return
  await adminClient.from('notifications').insert(
    admins.map((a: { id: string }) => ({ user_id: a.id, title, body, link }))
  )
}

Deno.serve(async (req) => {
  console.log('payfast-itn: received', req.method)

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    if (!serviceRoleKey || !supabaseUrl) {
      console.error('payfast-itn: server misconfigured')
      return new Response('Server misconfigured', { status: 500 })
    }

    const rawBody = await req.text()
    const params = new URLSearchParams(rawBody)
    const fields: Record<string, string> = {}
    for (const [k, v] of params.entries()) fields[k] = v

    // 1. Verify the signature PayFast sent matches what we compute ourselves.
    const expectedSignature = md5(buildSignature(fields, payfastPassphrase))
    if (expectedSignature !== fields.signature) {
      console.warn('payfast-itn: signature mismatch')
      return new Response('Invalid signature', { status: 400 })
    }

    // 2. Confirm this notification is addressed to our own merchant account —
    // cheap defense-in-depth alongside the signature/validate checks.
    if (payfastMerchantId && fields.merchant_id !== payfastMerchantId) {
      console.warn('payfast-itn: merchant_id mismatch', fields.merchant_id)
      return new Response('Merchant mismatch', { status: 400 })
    }

    // 3. Ask PayFast to confirm this ITN is genuine (server-to-server check).
    const validateResp = await fetch(payfastValidateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: rawBody,
    })
    const validateText = (await validateResp.text()).trim()
    if (validateText !== 'VALID') {
      console.warn('payfast-itn: PayFast validation returned', validateText)
      return new Response('Invalid ITN', { status: 400 })
    }

    // 4. Look up the payment attempt by the m_payment_id we generated at
    // checkout time — attempts are never overwritten, so this still resolves
    // correctly even if a newer link has since been generated for the same
    // invoice (see invoice_payment_attempts in migration 018).
    const mPaymentId = fields.m_payment_id
    const { data: attempt, error: attemptLookupError } = await adminClient
      .from('invoice_payment_attempts')
      .select('id, invoice_id, amount, status, company_id')
      .eq('m_payment_id', mPaymentId)
      .maybeSingle()

    if (attemptLookupError || !attempt) {
      console.error('payfast-itn: no payment attempt found for m_payment_id', mPaymentId)
      return new Response('Payment attempt not found', { status: 404 })
    }

    const { data: invoice, error: invoiceLookupError } = await adminClient
      .from('invoices')
      .select('id, payment_status, invoice_ref, title')
      .eq('id', attempt.invoice_id)
      .maybeSingle()

    if (invoiceLookupError || !invoice) {
      console.error('payfast-itn: invoice not found for attempt', attempt.id)
      return new Response('Invoice not found', { status: 404 })
    }

    // 5. The amount actually paid must match what we asked for at link
    // generation time — guards against an invoice's total changing between
    // when a link was sent and when it gets paid.
    const amountGross = Number(fields.amount_gross ?? 0)
    if (Math.abs(amountGross - Number(attempt.amount)) > 0.01) {
      console.error('payfast-itn: amount mismatch', { expected: attempt.amount, received: amountGross })
      await adminClient.from('invoice_events').insert({
        company_id: attempt.company_id,
        invoice_id: invoice.id,
        event_type: 'payment_failed',
        detail: `Amount mismatch: expected R${attempt.amount}, PayFast reported R${amountGross}`,
      })
      return new Response('Amount mismatch', { status: 400 })
    }

    const paymentStatus = fields.payment_status // COMPLETE | FAILED | PENDING

    if (paymentStatus === 'COMPLETE' && invoice.payment_status !== 'paid') {
      await adminClient
        .from('invoices')
        .update({
          payment_status: 'paid',
          payfast_payment_id: fields.pf_payment_id ?? null,
          paid_at: new Date().toISOString(),
          status: 'paid',
        })
        .eq('id', invoice.id)

      await adminClient
        .from('invoice_payment_attempts')
        .update({ status: 'completed', resolved_at: new Date().toISOString() })
        .eq('id', attempt.id)

      // Any other link generated for this same invoice that never got paid is
      // now moot — mark it superseded rather than leaving it stuck on
      // "pending" forever, which reads like an unresolved duplicate charge.
      await adminClient
        .from('invoice_payment_attempts')
        .update({ status: 'superseded', resolved_at: new Date().toISOString() })
        .eq('invoice_id', invoice.id)
        .eq('status', 'pending')
        .neq('id', attempt.id)

      await adminClient.from('invoice_events').insert({
        company_id: attempt.company_id,
        invoice_id: invoice.id,
        event_type: 'payment_completed',
        detail: `Paid R${attempt.amount} via PayFast (ref ${fields.pf_payment_id ?? 'n/a'})`,
      })

      await notifyAdmins(
        attempt.company_id,
        'Payment received',
        `${invoice.invoice_ref ?? invoice.title ?? 'Invoice'} was just paid via PayFast (R${attempt.amount}).`,
        `/finance/invoices/${invoice.id}`,
      )
    } else if (paymentStatus === 'FAILED') {
      await adminClient
        .from('invoices')
        .update({ payment_status: 'failed' })
        .eq('id', invoice.id)

      await adminClient
        .from('invoice_payment_attempts')
        .update({ status: 'failed', resolved_at: new Date().toISOString() })
        .eq('id', attempt.id)

      await adminClient.from('invoice_events').insert({
        company_id: attempt.company_id,
        invoice_id: invoice.id,
        event_type: 'payment_failed',
        detail: `PayFast reported payment failure for R${attempt.amount}`,
      })

      await notifyAdmins(
        attempt.company_id,
        'Payment failed',
        `A payment attempt on ${invoice.invoice_ref ?? invoice.title ?? 'an invoice'} failed — the customer may need a new link.`,
        `/finance/invoices/${invoice.id}`,
      )
    }

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('payfast-itn: unexpected error', err)
    return new Response('Unexpected error', { status: 500 })
  }
})
