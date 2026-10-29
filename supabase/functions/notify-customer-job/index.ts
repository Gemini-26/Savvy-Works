import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey   = Deno.env.get('RESEND_API_KEY') ?? ''
// Same secret as send-invoice-receipt / notify-customer-status — once a real
// domain is verified in Resend, setting it once fixes all three.
const fromEmail      = Deno.env.get('RECEIPT_FROM_EMAIL') ?? 'onboarding@resend.dev'

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Job text is typed by staff and ends up in an email body, so it's escaped.
function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatWhen(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDay(date: string | null) {
  if (!date) return null
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!serviceRoleKey || !supabaseUrl || !resendApiKey) {
      return json({ error: 'Server misconfigured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (callerError || !caller) return json({ error: 'Unauthorized' }, 401)

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('id, company_id, full_name')
      .eq('auth_user_id', caller.id)
      .maybeSingle()

    if (callerProfileError || !callerProfile?.company_id) {
      return json({ error: 'Your account is not linked to a company.' }, 403)
    }

    const { job_id } = await req.json()
    if (!job_id) return json({ error: 'job_id is required' }, 400)

    // Scoped to the caller's own company — same tenant-isolation guard as the
    // other email functions, since this runs with the service-role key.
    const { data: job, error: jobError } = await adminClient
      .from('jobs')
      .select(`
        id, job_ref, title, job_type, start_date, scheduled_for, alert_by_email,
        contact_name, contact_email,
        site_address, site_city, site_postcode,
        customers ( customer_name, email )
      `)
      .eq('id', job_id)
      .eq('company_id', callerProfile.company_id)
      .maybeSingle()

    if (jobError || !job) return json({ error: 'Job not found' }, 404)

    // The tickbox on the job is the instruction; a job saved without it never emails.
    if (!job.alert_by_email) {
      return json({ ok: true, skipped: true, reason: 'Alert Customer is not ticked on this job' })
    }

    const recipientEmail = (job.contact_email || job.customers?.email || '').trim()
    if (!recipientEmail) {
      return json({ error: 'This job has no customer email address, so nobody could be alerted.' }, 400)
    }

    const { data: company } = await adminClient
      .from('companies')
      .select('name')
      .eq('id', callerProfile.company_id)
      .maybeSingle()

    const companyName  = company?.name || 'Savvy Civils and Plumbing'
    const customerName = job.contact_name || job.customers?.customer_name || 'there'
    const jobLabel     = job.title || job.job_ref || 'your job'
    const when         = formatWhen(job.scheduled_for) ?? formatDay(job.start_date)
    const siteLine     = [job.site_address, job.site_city, job.site_postcode].filter(Boolean).join(', ')

    const rows = [
      ['Job', job.job_ref ? `${jobLabel} (${job.job_ref})` : jobLabel],
      job.job_type ? ['Type', job.job_type] : null,
      when ? ['When', when] : null,
      siteLine ? ['Site', siteLine] : null,
    ].filter(Boolean) as string[][]

    const table = rows
      .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`)
      .join('')

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${companyName} <${fromEmail}>`,
        to: [recipientEmail],
        subject: `Your job has been booked${job.job_ref ? ` — ${job.job_ref}` : ''}`,
        html:
          `<p>Hi ${esc(customerName)},</p>` +
          `<p>We've booked your job with ${esc(companyName)}. Here are the details:</p>` +
          `<table style="border-collapse:collapse">${table}</table>` +
          `<p>We'll be in touch if anything changes. If you have any questions, just reply to this email.</p>`,
      }),
    })

    if (!resendResp.ok) {
      const body = await resendResp.text()
      console.error('notify-customer-job: Resend error', resendResp.status, body)
      // Resend's sandbox sender refuses everyone but the account owner. Say so
      // plainly instead of a bare "failed", so the cause is obvious on screen.
      if (resendResp.status === 403 && /verify a domain|testing emails/i.test(body)) {
        return json({
          error: 'Customer emails can’t be delivered yet — a sending domain still needs to be verified in Resend.',
          code: 'sandbox_sender',
        }, 502)
      }
      return json({ error: 'Failed to send email' }, 502)
    }

    return json({ ok: true, sent_to: recipientEmail })

  } catch (err) {
    console.error('notify-customer-job: unexpected error', err)
    return json({ error: err.message ?? 'Unexpected error' }, 500)
  }
})
