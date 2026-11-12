-- ──────────────────────────────────────────────────────────────
-- AUTOMATIC 17:00 CLOCK-OUT — everyone still clocked in at 17:00
-- (South African time) is clocked out by the database, and every
-- device they use gets a loud "You have been clocked out" alert.
--
-- Three clocks exist and all three are closed:
--   work_shifts            the day shift of a person with a login
--   appointment_assignments  their on-site visit (actual_start/end)
--   team_member_shifts     a team member a technician clocked in
--
-- Only clock-ins from the last 24 hours are touched. The database
-- already holds visits left open since July: closing those at
-- "now" would give them months of hours and wreck payroll, so they
-- are left for an admin to fix by hand (the function reports how
-- many it skipped).
--
-- What gets written:
--   • clock_out = now(), auto_clocked_out = true (shown as "clocked
--     out automatically" next to the time on the timesheets).
--   • One notification per person (urgent = true). A person whose own
--     clock was open hears "You have been clocked out"; a team
--     member has no login, so whoever clocked them in is told.
--   • A line in the job's activity log for each on-site visit.
--
-- Loudness is the client's job: an urgent notification makes the open
-- app play an alarm and keep a card on screen until dismissed, and
-- the send-push function delivers it to closed browsers and the
-- Android app on a high-priority channel. This file only writes the
-- rows and asks send-push to deliver them.
--
-- The schedule itself is in the next migration (it needs pg_cron).
-- ──────────────────────────────────────────────────────────────

-- ── Columns ────────────────────────────────────────────────────
alter table notifications          add column if not exists urgent            boolean not null default false;
alter table work_shifts            add column if not exists auto_clocked_out  boolean not null default false;
alter table team_member_shifts     add column if not exists auto_clocked_out  boolean not null default false;
alter table appointment_assignments add column if not exists auto_clocked_out boolean not null default false;

-- ── Only the scheduled job may set these ───────────────────────
-- A signed-in person (technician or admin) can neither mark their own
-- clock-out "automatic" nor raise an urgent alert on a colleague's
-- phone. The job runs with no signed-in user (auth.uid() is null).
-- Reopening a clock-out makes it a normal, unfinished clock-in again.
create or replace function guard_auto_clocked_out_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.auto_clocked_out := false;
    else
      new.auto_clocked_out := old.auto_clocked_out;
    end if;
  end if;
  if new.clock_out is null then
    new.auto_clocked_out := false;
  end if;
  return new;
end;
$$;

create or replace function guard_auto_clocked_out_flag_on_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.auto_clocked_out := old.auto_clocked_out;
  end if;
  if new.actual_end is null then
    new.auto_clocked_out := false;
  end if;
  return new;
end;
$$;

create or replace function guard_notification_urgent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.urgent := false;
    else
      new.urgent := old.urgent;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_auto_clocked_out_flag on work_shifts;
create trigger trg_guard_auto_clocked_out_flag
  before insert or update on work_shifts
  for each row execute function guard_auto_clocked_out_flag();

drop trigger if exists trg_guard_auto_clocked_out_flag on team_member_shifts;
create trigger trg_guard_auto_clocked_out_flag
  before insert or update on team_member_shifts
  for each row execute function guard_auto_clocked_out_flag();

drop trigger if exists trg_guard_auto_clocked_out_flag on appointment_assignments;
create trigger trg_guard_auto_clocked_out_flag
  before update on appointment_assignments
  for each row execute function guard_auto_clocked_out_flag_on_site();

drop trigger if exists trg_guard_notification_urgent on notifications;
create trigger trg_guard_notification_urgent
  before insert or update on notifications
  for each row execute function guard_notification_urgent();

-- ── Ask send-push to deliver notifications ─────────────────────
-- The function lives at an address and takes a shared secret, both kept
-- in Supabase Vault (never in this file): send_push_url and
-- send_push_secret — scripts/setup-clock-out-push.mjs creates them and
-- sets the matching CRON_SECRET on the function. Missing → a warning
-- and no push; the in-app alert still arrives.
create or replace function push_notifications_via_edge(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_from   int := 1;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'send_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'send_push_secret';
  if v_url is null or v_secret is null then
    raise warning 'push alerts not sent: send_push_url / send_push_secret are missing from the vault';
    return;
  end if;

  -- send-push takes at most 50 ids per call.
  while v_from <= cardinality(p_ids) loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body    := jsonb_build_object('notification_ids', to_jsonb(p_ids[v_from:v_from + 49])),
      timeout_milliseconds := 10000
    );
    v_from := v_from + 50;
  end loop;
end;
$$;

-- ── The clock-out itself ───────────────────────────────────────
create or replace function auto_clock_out_everyone()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_since timestamptz := now() - interval '24 hours';
  v_at    text        := to_char(now() at time zone 'Africa/Johannesburg', 'HH24:MI');
  v_day   int := 0;
  v_site  int := 0;
  v_team  int := 0;
  v_ids   uuid[] := '{}';
begin
  -- Who to tell, filled in as each clock is closed below.
  drop table if exists _auto_clock_out;
  create temp table _auto_clock_out (
    user_id    uuid,
    company_id uuid,
    kind       text,   -- 'self' = their own clock · 'team' = a team member they clocked in
    label      text
  ) on commit drop;

  -- Day shifts.
  with closed as (
    update work_shifts
       set clock_out = v_now, auto_clocked_out = true
     where clock_out is null and clock_in >= v_since and clock_in < v_now
    returning technician_id, company_id
  ), who as (
    insert into _auto_clock_out (user_id, company_id, kind)
    select technician_id, company_id, 'self' from closed
    returning 1
  )
  select count(*) into v_day from closed;

  -- On-site visits, each noted on its job.
  with closed as (
    update appointment_assignments
       set actual_end = v_now, auto_clocked_out = true
     where actual_start is not null and actual_end is null
       and actual_start >= v_since and actual_start < v_now
    returning technician_id, company_id, appointment_id
  ), who as (
    insert into _auto_clock_out (user_id, company_id, kind)
    select technician_id, company_id, 'self' from closed
    returning 1
  ), noted as (
    insert into job_activity (company_id, job_id, actor_name, action, detail)
    select c.company_id, a.job_id, 'System', 'clocked_out',
           coalesce(p.full_name, 'A technician') || ' was clocked out automatically at ' || v_at
      from closed c
      join appointments a on a.id = c.appointment_id
      left join profiles p on p.id = c.technician_id
    returning 1
  )
  select count(*) into v_site from closed;

  -- Team members: no login, so the person who clocked them in is told.
  with closed as (
    update team_member_shifts
       set clock_out = v_now, auto_clocked_out = true
     where clock_out is null and clock_in >= v_since and clock_in < v_now
    returning team_member_id, company_id, clocked_in_by
  ), who as (
    insert into _auto_clock_out (user_id, company_id, kind, label)
    select c.clocked_in_by, c.company_id, 'team', tm.full_name
      from closed c
      join team_members tm on tm.id = c.team_member_id
     where c.clocked_in_by is not null
    returning 1
  )
  select count(*) into v_team from closed;

  -- One urgent notification per person.
  with grouped as (
    select user_id, company_id,
           bool_or(kind = 'self') as own,
           array_agg(distinct label order by label) filter (where kind = 'team') as members
      from _auto_clock_out
     group by user_id, company_id
  ), worded as (
    select user_id, company_id, own,
           case
             when members is null then null
             when cardinality(members) > 6
               then array_to_string(members[1:6], ', ') || ' and ' || (cardinality(members) - 6) || ' more'
             else array_to_string(members, ', ')
           end as member_text,
           cardinality(members) as member_count
      from grouped
  ), added as (
    insert into notifications (company_id, user_id, title, body, urgent)
    select company_id, user_id,
           case when own then 'You have been clocked out' else 'Team members clocked out' end,
           case
             when own and member_text is null
               then 'You were clocked out automatically at ' || v_at || '. If you are still working, clock in again.'
             when own
               then 'You were clocked out automatically at ' || v_at || '. Also clocked out: ' || member_text
                    || '. If you are still working, clock in again.'
             else member_text || case when member_count = 1 then ' was' else ' were' end
                  || ' clocked out automatically at ' || v_at || '.'
           end,
           true
      from worded
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from added;

  -- The clock-outs above are what matters: a push problem must never undo them.
  if cardinality(v_ids) > 0 then
    begin
      perform push_notifications_via_edge(v_ids);
    exception when others then
      raise warning 'auto clock-out: could not queue the push alerts: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'at',         v_now,
    'day_shifts', v_day,
    'on_site',    v_site,
    'team',       v_team,
    'notified',   cardinality(v_ids),
    -- Open longer than a day: left alone on purpose (see the top of this file).
    'left_open_older_than_24h', jsonb_build_object(
      'day_shifts', (select count(*) from work_shifts where clock_out is null and clock_in < v_since),
      'on_site',    (select count(*) from appointment_assignments where actual_start is not null and actual_end is null and actual_start < v_since),
      'team',       (select count(*) from team_member_shifts where clock_out is null and clock_in < v_since)
    )
  );
end;
$$;

-- Only the scheduler (postgres) and the service role may run these. Supabase
-- hands every new function to anon and authenticated by default.
revoke all on function auto_clock_out_everyone()          from public, anon, authenticated;
revoke all on function push_notifications_via_edge(uuid[]) from public, anon, authenticated;
grant execute on function auto_clock_out_everyone()          to service_role;
grant execute on function push_notifications_via_edge(uuid[]) to service_role;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
