import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!serviceRoleKey || !supabaseUrl) {
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

    // Verify the caller is logged in
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, full_name, role, phone, color } = await req.json()

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'email, password and full_name are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 1: create the auth user
    console.log('Creating auth user:', email)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      console.error('Auth createUser error:', JSON.stringify(authError, Object.getOwnPropertyNames(authError)))
      return new Response(JSON.stringify({ error: authError.message || JSON.stringify(authError) }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newUserId = authData.user.id

    // Step 2: look up the caller's company_id so the new profile inherits it
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('company_id')
      .eq('auth_user_id', caller.id)
      .maybeSingle()

    // Step 3: create the profile row directly (no trigger needed)
    const { error: profileError } = await adminClient
      .from('profiles')
      .insert({
        auth_user_id: newUserId,
        email,
        full_name,
        role:       role  ?? 'technician',
        phone:      phone ?? null,
        color:      color ?? '#3B82F6',
        is_active:  true,
        company_id: callerProfile?.company_id ?? null,
      })

    if (profileError) {
      console.error('Profile insert error:', JSON.stringify(profileError, Object.getOwnPropertyNames(profileError)))
      // Roll back: delete the auth user we just created so we don't leave orphans
      await adminClient.auth.admin.deleteUser(newUserId)
      return new Response(JSON.stringify({ error: profileError.message || 'Failed to create profile' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('User created successfully:', newUserId)
    return new Response(JSON.stringify({ id: newUserId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
