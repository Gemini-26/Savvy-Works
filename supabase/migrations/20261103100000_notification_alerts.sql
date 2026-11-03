-- ──────────────────────────────────────────────────────────────
-- NOTIFICATION ALERTS — the bell used to be checked every 30 seconds
-- and said nothing out loud. Three things change:
--
--   1. notifications joins the realtime publication, so a signed-in
--      person's screen hears about a new one the moment it is written
--      (sound + on-screen pop-up). Nothing was published before.
--
--   2. push_subscriptions — one row per browser/phone that agreed to
--      "Turn on pop-up alerts", so the send-push function can reach
--      people whose app is closed (shows in the system notification bar).
--
--   3. notifications.pushed_at — send-push claims a row by stamping it,
--      so a notification is pushed at most once however often it is asked.
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

alter table notifications add column if not exists pushed_at timestamptz;

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  -- The push service's address for this browser; unique, so turning alerts
  -- on twice on the same device updates the row instead of doubling it.
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx    on push_subscriptions (user_id);
create index if not exists push_subscriptions_company_idx on push_subscriptions (company_id);

alter table push_subscriptions enable row level security;

-- Each person sees and removes only their own devices. Adding goes through
-- register_push_subscription() below, and send-push reads every row with the
-- service-role key (which skips RLS).
drop policy if exists "push_subscriptions_select_own" on push_subscriptions;
create policy "push_subscriptions_select_own"
  on push_subscriptions for select
  using (user_id = get_my_profile_id());

drop policy if exists "push_subscriptions_delete_own" on push_subscriptions;
create policy "push_subscriptions_delete_own"
  on push_subscriptions for delete
  using (user_id = get_my_profile_id());

-- A browser has one push address however many people sign in on it, so the
-- last person to turn alerts on there takes it over. A plain upsert couldn't
-- do that: RLS would hide the previous person's row from the new one.
create or replace function register_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
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

  insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth, user_agent)
  values (v_company, v_profile, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set company_id = excluded.company_id,
        user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        created_at = now();
end;
$$;

revoke all on function register_push_subscription(text, text, text, text) from public;
grant execute on function register_push_subscription(text, text, text, text) to authenticated;
