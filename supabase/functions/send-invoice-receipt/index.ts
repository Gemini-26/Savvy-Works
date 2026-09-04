import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? ''
// resend.dev's shared sending domain works with no setup, but only delivers
// to the email address the Resend account itself is registered with — swap
// this for "receipts@yourdomain.co.za" once a real domain is verified in
// Resend, so receipts can go to any customer.
const fromEmail      = Deno.env.get('RECEIPT_FROM_EMAIL') ?? 'onboarding@resend.dev'

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!serviceRoleKey || !supabaseUrl || !resendApiKey) {
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

    const { invoice_id, pdf_base64 } = await req.json()
    if (!invoice_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'invoice_id and pdf_base64 are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Scoped to the caller's own company — same tenant-isolation guard as
    // create-payfast-payment, since this runs with the service-role key.
    const { data: invoice, error: invoiceError } = await adminClient
      .from('invoices')
      .select('id, invoice_ref, title, total, payment_status, company_id, customers ( customer_name, email )')
      .eq('id', invoice_id)
      .eq('company_id', callerProfile.company_id)
      .maybeSingle()

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const recipientEmail = invoice.customers?.email
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'This customer has no email address on file.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const customerName = invoice.customers?.customer_name || 'there'
    const label = invoice.title || invoice.invoice_ref || 'your invoice'
    const paidLine = invoice.payment_status === 'paid'
      ? `<p>Thank you for your payment of <strong>R${Number(invoice.total).toFixed(2)}</strong> for ${label}. Please find your receipt attached.</p>`
      : `<p>Please find your invoice for ${label} attached.</p>`

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Savvy Civils and Plumbing <${fromEmail}>`,
        to: [recipientEmail],
        subject: `Receipt for ${invoice.invoice_ref || label}`,
        html: `<p>Hi ${customerName},</p>${paidLine}<p>If you have any questions, just reply to this email.</p>`,
        attachments: [{
          filename: `${invoice.invoice_ref || 'invoice'}.pdf`,
          content: pdf_base64,
        }],
      }),
    })

    if (!resendResp.ok) {
      const body = await resendResp.text()
      console.error('send-invoice-receipt: Resend error', resendResp.status, body)
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await adminClient.from('invoice_events').insert({
      company_id: callerProfile.company_id,
      invoice_id: invoice.id,
      event_type: 'link_sent_email',
      actor_id: callerProfile.id,
      actor_name: callerProfile.full_name,
      detail: `Receipt emailed to ${recipientEmail}`,
    })

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('send-invoice-receipt: unexpected error', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
