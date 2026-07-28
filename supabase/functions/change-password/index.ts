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

    // Only admins may change another user's password
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('id, role, company_id')
      .eq('auth_user_id', caller.id)
      .maybeSingle()

    if (callerProfileError || !callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can change passwords' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { profileId, newPassword } = await req.json()

    if (!profileId || !newPassword) {
      return new Response(JSON.stringify({ error: 'profileId and newPassword are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the target profile and make sure it's in the caller's company
    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('id, auth_user_id, company_id')
      .eq('id', profileId)
      .maybeSingle()

    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (targetProfile.company_id !== callerProfile.company_id) {
      return new Response(JSON.stringify({ error: 'Not authorized for this user' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetProfile.auth_user_id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('updateUserById error:', JSON.stringify(updateError, Object.getOwnPropertyNames(updateError)))
      return new Response(JSON.stringify({ error: updateError.message || 'Failed to update password' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auto-resolve any pending password change request for this profile
    await adminClient
      .from('password_change_requests')
      .update({ status: 'completed', resolved_by: callerProfile.id, resolved_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .eq('status', 'pending')

    // Let the user know their password was changed. Inserted with the
    // service-role key (no auth.uid() session), so company_id must be set
    // explicitly — the set_company_id_on_insert trigger can't derive it here.
    await adminClient.from('notifications').insert([{
      company_id: targetProfile.company_id,
      user_id: profileId,
      title: 'Password changed',
      body: 'An admin changed your password.',
      link: '/profile',
    }])

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
