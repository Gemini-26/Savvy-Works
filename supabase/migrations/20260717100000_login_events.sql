-- ──────────────────────────────────────────────────────────────
-- LOGIN EVENTS — one row per successful sign-in, so the new
-- "User Logs" admin page can show when each user last logged in.
-- Written client-side right after a successful signInWithPassword;
-- there's no server-side auth hook available here, so this is a
-- best-effort record rather than a true auth audit trail.
-- ──────────────────────────────────────────────────────────────
create table if not exists login_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  logged_in_at  timestamptz not null default now()
);

create index if not exists login_events_profile_id_idx on login_events (profile_id);
create index if not exists login_events_company_id_idx on login_events (company_id);

alter table login_events enable row level security;

create or replace trigger trg_login_events_company_id
  before insert on login_events
  for each row execute function set_company_id_on_insert();

-- Admins see every login in their company; everyone can see (and insert) their own.
drop policy if exists "login_events_select" on login_events;
create policy "login_events_select"
  on login_events for select
  using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or profile_id = (select id from profiles where auth_user_id = auth.uid())
    )
  );

drop policy if exists "login_events_insert_own" on login_events;
create policy "login_events_insert_own"
  on login_events for insert
  with check (
    company_id = get_my_company_id()
    and profile_id = (select id from profiles where auth_user_id = auth.uid())
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
