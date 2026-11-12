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

// Firebase service-account key (JSON, or that JSON base64-encoded). Optional:
// without it the Android app is skipped and browsers still get their alerts.
const fcmServiceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? ''

// Shared secret the database sends (x-cron-secret) when IT asks for a push —
// the automatic 17:00 clock-out has no signed-in person to authenticate as.
// Also stored in the vault as send_push_secret; scripts/setup-clock-out-push.mjs
// sets both. Unset = the database path is closed and only signed-in callers work.
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type ServiceAccount = { project_id: string; client_email: string; private_key: string }

function loadServiceAccount(): ServiceAccount | null {
  const raw = fcmServiceAccountRaw.trim()
  if (!raw) return null
  try {
    const account = JSON.parse(raw.startsWith('{') ? raw : atob(raw))
    return account.project_id && account.client_email && account.private_key ? account : null
  } catch {
    console.error('FCM_SERVICE_ACCOUNT is set but is not valid service-account JSON')
    return null
  }
}

const serviceAccount = loadServiceAccount()

function base64url(data: ArrayBuffer | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cachedAccessToken: { value: string; expiresAt: number } | null = null

// Google wants a short-lived access token, obtained by signing a JWT with the
// service account's private key. Cached so a burst of notifications signs once.
async function fcmAccessToken(account: ServiceAccount) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const keyBytes = Uint8Array.from(
    atob(account.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')),
    c => c.charCodeAt(0),
  )
  const key = await crypto.subtle.importKey(
    'pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
  })
  if (!res.ok) throw new Error(`Google refused the Firebase sign-in (${res.status})`)
  const { access_token, expires_in } = await res.json()
  cachedAccessToken = { value: access_token, expiresAt: Date.now() + expires_in * 1000 }
  return access_token as string
}

type PushJob = {
  id: string; user_id: string; title: string; body: string | null; link: string | null; urgent: boolean | null
}

// 'dead' = Google says that phone's token will never work again (app
// uninstalled or data cleared), so the caller deletes it.
async function sendFcm(
  account: ServiceAccount, accessToken: string, token: string, n: PushJob,
): Promise<'sent' | 'dead' | 'failed'> {
  // An urgent alert (e.g. "You have been clocked out") rides the app's loudest
  // channel — maximum importance, so it sounds and pops over whatever is on
  // screen — and is dropped if the phone only comes back online much later,
  // when "you have been clocked out" would just be confusing.
  const urgent = !!n.urgent
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: n.title, body: n.body ?? '' },
        data: { link: n.link ?? '/', tag: `n-${n.id}`, ...(urgent ? { urgent: '1' } : {}) },
        android: {
          priority: 'HIGH',
          ...(urgent ? { ttl: '1800s' } : {}),
          // The app creates these channels (sound + vibration; see nativePushService).
          notification: {
            channel_id: urgent ? 'clock_out' : 'alerts',
            sound: 'default',
            tag: `n-${n.id}`,
            ...(urgent ? { notification_priority: 'PRIORITY_MAX', visibility: 'PUBLIC', default_vibrate_timings: true } : {}),
          },
        },
      },
    }),
  })
  if (res.ok) return 'sent'
  const text = await res.text()
  if (res.status === 404 || text.includes('UNREGISTERED')) return 'dead'
  console.error('fcm send failed', res.status, text.slice(0, 300))
  return 'failed'
}

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

    // Two ways in: the database (shared secret — the 17:00 auto clock-out) or a
    // signed-in person (their own company's notifications only).
    const secretHeader = req.headers.get('x-cron-secret')
    let companyId: string | null = null
    let fromDatabase = false

    if (secretHeader !== null) {
      if (!cronSecret || !sameSecret(secretHeader, cronSecret)) return json({ error: 'Unauthorized' }, 401)
      fromDatabase = true
    } else {
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
      companyId = callerProfile.company_id
    }

    const { notification_ids } = await req.json()
    if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
      return json({ error: 'notification_ids is required' }, 400)
    }
    const ids = notification_ids.slice(0, 50)

    // Claim the rows by stamping them: a notification is pushed once however
    // often it is asked for. A signed-in caller only reaches their own company's
    // rows. Old rows are ignored so an id can't be replayed: two minutes for a
    // person's request, fifteen for the database's (its request is queued and
    // can arrive a little late).
    const freshFor = (fromDatabase ? 15 : 2) * 60 * 1000
    let claimQuery = adminClient
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .in('id', ids)
      .is('pushed_at', null)
      .gte('created_at', new Date(Date.now() - freshFor).toISOString())
    if (companyId) claimQuery = claimQuery.eq('company_id', companyId)
    const { data: claimed, error: claimError } = await claimQuery
      .select('id, user_id, title, body, link, urgent')
    if (claimError) return json({ error: claimError.message }, 500)
    if (!claimed || claimed.length === 0) return json({ ok: true, sent: 0 })

    const userIds = [...new Set(claimed.map(n => n.user_id))]
    const { data: subs, error: subsError } = await adminClient
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', userIds)
    if (subsError) return json({ error: subsError.message }, 500)

    // Android phones sign up in their own table (see device_tokens).
    const { data: phones, error: phonesError } = await adminClient
      .from('device_tokens')
      .select('id, user_id, token')
      .in('user_id', userIds)
    if (phonesError) return json({ error: phonesError.message }, 500)

    let sent = 0
    let sentToPhones = 0
    const dead: string[] = []
    const deadPhones: string[] = []

    if (serviceAccount && (phones ?? []).length > 0) {
      try {
        const accessToken = await fcmAccessToken(serviceAccount)
        for (const n of claimed) {
          await Promise.all((phones ?? []).filter(p => p.user_id === n.user_id).map(async (p) => {
            const result = await sendFcm(serviceAccount, accessToken, p.token, n)
            if (result === 'sent') sentToPhones++
            else if (result === 'dead') deadPhones.push(p.id)
          }))
        }
      } catch (err) {
        // A Firebase problem must not stop the browser alerts below.
        console.error('fcm unavailable', (err as Error).message)
      }
    }

    for (const n of claimed) {
      const payload = JSON.stringify({
        title: n.title, body: n.body ?? '', link: n.link ?? '/', tag: `n-${n.id}`, urgent: !!n.urgent,
      })
      await Promise.all((subs ?? []).filter(s => s.user_id === n.user_id).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            // An urgent alert that is stale by the time the browser is back online
            // (half an hour) is dropped rather than shown late.
            { TTL: n.urgent ? 30 * 60 : 60 * 60, urgency: 'high' },
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
    if (deadPhones.length > 0) await adminClient.from('device_tokens').delete().in('id', deadPhones)

    return json({ ok: true, sent, sentToPhones, removed: dead.length + deadPhones.length })
  } catch (err) {
    console.error('send-push error', err)
    return json({ error: 'Something went wrong sending the alert.' }, 500)
  }
})
