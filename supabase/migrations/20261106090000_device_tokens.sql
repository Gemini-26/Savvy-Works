-- ──────────────────────────────────────────────────────────────
-- DEVICE TOKENS — alerts for the Android app while it is closed.
--
-- Browsers register through push_subscriptions (Web Push). The Android app
-- is a shell around a web view that cannot receive Web Push, so each phone
-- instead registers the address Firebase Cloud Messaging gives it, here.
-- send-push reads both tables and sends each notification down every
-- route the person has set up.
-- ──────────────────────────────────────────────────────────────

create table if not exists device_tokens (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  -- Firebase's address for this install of the app; unique, so a phone that
  -- registers twice updates its row instead of doubling it.
  token       text not null unique,
  platform    text not null default 'android' check (platform in ('android', 'ios')),
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists device_tokens_user_idx    on device_tokens (user_id);
create index if not exists device_tokens_company_idx on device_tokens (company_id);

alter table device_tokens enable row level security;

-- Each person sees and removes only their own phones (signing out removes the
-- phone's row). Adding goes through register_device_token() below, and
-- send-push reads every row with the service-role key (which skips RLS).
drop policy if exists "device_tokens_select_own" on device_tokens;
create policy "device_tokens_select_own"
  on device_tokens for select
  using (user_id = get_my_profile_id());

drop policy if exists "device_tokens_delete_own" on device_tokens;
create policy "device_tokens_delete_own"
  on device_tokens for delete
  using (user_id = get_my_profile_id());

-- A phone has one token however many people sign in on it, so the last person
-- to sign in takes it over (same reason as register_push_subscription).
create or replace function register_device_token(
  p_token      text,
  p_platform   text default 'android',
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := get_my_profile_id();
  v_company uuid := get_my_company_id();
begin
  if v_profile is null or v_company is null then
    raise exception 'Not signed in';
  end if;

  insert into device_tokens (company_id, user_id, token, platform, user_agent)
  values (v_company, v_profile, p_token, p_platform, p_user_agent)
  on conflict (token) do update
    set company_id = excluded.company_id,
        user_id    = excluded.user_id,
        platform   = excluded.platform,
        user_agent = excluded.user_agent,
        created_at = now();
end;
$$;

-- Supabase's default grants hand every new function to anon; the function
-- refuses anyone who isn't signed in, but there is no reason to leave the door
-- on the latch. Same tidy-up for the Web Push twin from 20261103100000.
revoke all on function register_device_token(text, text, text) from public, anon;
grant execute on function register_device_token(text, text, text) to authenticated;

revoke all on function register_push_subscription(text, text, text, text) from anon;
