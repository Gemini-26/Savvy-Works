import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? ''
const fromEmail      = Deno.env.get('RECEIPT_FROM_EMAIL') ?? 'onboarding@resend.dev'

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Only statuses worth telling the customer about get a message here —
// keep this in sync with CUSTOMER_NOTIFIED_STATUSES in
// src/shared/constants/appointmentStatuses.js.
const MESSAGES: Record<string, (jobLabel: string) => string> = {
  on_route: (jobLabel) => `Your technician is on the way for ${jobLabel}.`,
}

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

    const { appointment_id, status } = await req.json()
    if (!appointment_id || !status) {
      return new Response(JSON.stringify({ error: 'appointment_id and status are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const messageFor = MESSAGES[status]
    if (!messageFor) {
      // Not a customer-facing status — nothing to send, not an error.
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Scoped to the caller's own company, same tenant-isolation guard as
    // send-invoice-receipt, since this runs with the service-role key.
    const { data: appt, error: apptError } = await adminClient
      .from('appointments')
      .select('id, company_id, jobs ( title, job_ref, customers ( customer_name, email ) )')
      .eq('id', appointment_id)
      .eq('company_id', callerProfile.company_id)
      .maybeSingle()

    if (apptError || !appt) {
      return new Response(JSON.stringify({ error: 'Appointment not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const recipientEmail = appt.jobs?.customers?.email
    if (!recipientEmail) {
      // No email on file for this customer — nothing we can do, but not a hard failure.
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no customer email on file' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const customerName = appt.jobs?.customers?.customer_name || 'there'
    const jobLabel = appt.jobs?.title || appt.jobs?.job_ref || 'your job'

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Savvy Civils and Plumbing <${fromEmail}>`,
        to: [recipientEmail],
        subject: 'Your technician is on the way',
        html: `<p>Hi ${customerName},</p><p>${messageFor(jobLabel)}</p>`,
      }),
    })

    if (!resendResp.ok) {
      const body = await resendResp.text()
      console.error('notify-customer-status: Resend error', resendResp.status, body)
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('notify-customer-status: unexpected error', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
