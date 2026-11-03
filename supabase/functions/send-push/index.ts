import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
// Push services want a contact for whoever is sending; a mailto: is the usual one.
const vapidSubject    = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:sales@savvyplumbing.co.za'

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!serviceRoleKey || !supabaseUrl || !vapidPublicKey || !vapidPrivateKey) {
      return json({ error: 'Server misconfigured' }, 500)
    }
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (callerError || !caller) return json({ error: 'Unauthorized' }, 401)

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('id, company_id')
      .eq('auth_user_id', caller.id)
      .maybeSingle()
    if (!callerProfile?.company_id) return json({ error: 'Your account is not linked to a company.' }, 403)

    const { notification_ids } = await req.json()
    if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
      return json({ error: 'notification_ids is required' }, 400)
    }
    const ids = notification_ids.slice(0, 50)

    // Claim the rows by stamping them: a notification is pushed once however
    // often it is asked for, and only ones in the caller's own company count.
    // Rows older than a couple of minutes are ignored so an old id can't be
    // replayed.
    const { data: claimed, error: claimError } = await adminClient
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .in('id', ids)
      .eq('company_id', callerProfile.company_id)
      .is('pushed_at', null)
      .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
      .select('id, user_id, title, body, link')
    if (claimError) return json({ error: claimError.message }, 500)
    if (!claimed || claimed.length === 0) return json({ ok: true, sent: 0 })

    const userIds = [...new Set(claimed.map(n => n.user_id))]
    const { data: subs, error: subsError } = await adminClient
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', userIds)
    if (subsError) return json({ error: subsError.message }, 500)

    let sent = 0
    const dead: string[] = []

    for (const n of claimed) {
      const payload = JSON.stringify({
        title: n.title, body: n.body ?? '', link: n.link ?? '/', tag: `n-${n.id}`,
      })
      await Promise.all((subs ?? []).filter(s => s.user_id === n.user_id).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60, urgency: 'high' },
          )
          sent++
        } catch (err) {
          // 404/410: the browser was uninstalled or alerts were switched off,
          // so that address will never work again.
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) dead.push(s.id)
          else console.error('push failed', status, (err as Error).message)
        }
      }))
    }

    if (dead.length > 0) await adminClient.from('push_subscriptions').delete().in('id', dead)

    return json({ ok: true, sent, removed: dead.length })
  } catch (err) {
    console.error('send-push error', err)
    return json({ error: 'Something went wrong sending the alert.' }, 500)
  }
})
