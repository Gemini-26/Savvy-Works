-- ──────────────────────────────────────────────────────────────
-- TEAM MEMBER CLOCK — until now a team member (labourer/helper) had
-- no clock of their own: their hours were whatever on-site window the
-- technician logged. Technicians can now clock a team member in from
-- the floating clock button, two ways:
--
--   with_technician  "Clock-in Team member" — they are with the
--                    technician (travelling or on the same site).
--   drop_off         "Drop-off and clock-in Team member" — the
--                    technician drops them at a job site and clocks
--                    them in there, then carries on elsewhere.
--
-- One row = one stretch from clock-in to clock-out. A team member can
-- only have one open stretch at a time.
--
-- The times are the server's, not the phone's: a technician can't
-- backdate a clock-in or edit a recorded time (same rule as
-- appointment_assignments — see guard_assignment_clock_times).
-- Admins can correct times; the first values are kept.
-- ──────────────────────────────────────────────────────────────

create table if not exists team_member_shifts (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  clock_in       timestamptz not null default now(),
  clock_out      timestamptz,
  mode           text not null default 'with_technician'
                   check (mode in ('with_technician', 'drop_off')),
  -- Drop-off site. Kept as a label too, so the history still reads
  -- properly if the job is later archived or its address edited.
  job_id         uuid references jobs(id) on delete set null,
  site_label     text,
  clocked_in_by  uuid references profiles(id) on delete set null,
  clocked_out_by uuid references profiles(id) on delete set null,
  -- Where the technician's phone was when they tapped (soft record only).
  in_lat         double precision,
  in_lng         double precision,
  note           text,
  original_clock_in  timestamptz,
  original_clock_out timestamptz,
  created_at     timestamptz not null default now(),
  constraint team_member_shifts_order_chk check (clock_out is null or clock_out > clock_in),
  constraint team_member_shifts_geo_chk check (
    (in_lat is null or in_lat between -90 and 90)
    and (in_lng is null or in_lng between -180 and 180)
  )
);

create index if not exists team_member_shifts_company_idx on team_member_shifts (company_id);
create index if not exists team_member_shifts_member_idx  on team_member_shifts (team_member_id, clock_in desc);
create index if not exists team_member_shifts_job_idx     on team_member_shifts (job_id);

-- Someone who is already clocked in can't be clocked in a second time
-- (two phones tapping at once, or a double tap).
create unique index if not exists team_member_shifts_one_open
  on team_member_shifts (team_member_id) where clock_out is null;

alter table team_member_shifts enable row level security;

drop policy if exists "team_member_shifts_select_company" on team_member_shifts;
create policy "team_member_shifts_select_company"
  on team_member_shifts for select
  using (company_id = get_my_company_id());

-- Any signed-in person in the company can clock a team member in or
-- out (they have no login of their own); the trigger below stamps who.
drop policy if exists "team_member_shifts_insert_company" on team_member_shifts;
create policy "team_member_shifts_insert_company"
  on team_member_shifts for insert
  with check (
    company_id = get_my_company_id()
    and exists (
      select 1 from team_members tm
      where tm.id = team_member_id and tm.company_id = get_my_company_id()
    )
  );

drop policy if exists "team_member_shifts_update_company" on team_member_shifts;
create policy "team_member_shifts_update_company"
  on team_member_shifts for update
  using (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

drop policy if exists "team_member_shifts_delete_admin" on team_member_shifts;
create policy "team_member_shifts_delete_admin"
  on team_member_shifts for delete
  using (company_id = get_my_company_id() and get_my_role() = 'admin');

create or replace trigger trg_team_member_shifts_company_id
  before insert on team_member_shifts
  for each row execute function set_company_id_on_insert();

-- ── Clock-in: server time, and who tapped ─────────────────────
create or replace function guard_team_member_shift_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_admin boolean := auth.uid() is null or get_my_role() = 'admin';
  v_me       uuid;
begin
  select id into v_me from profiles where auth_user_id = auth.uid() limit 1;
  new.clocked_in_by := coalesce(v_me, new.clocked_in_by);

  if not v_is_admin then
    -- Always "now", and never created already closed.
    new.clock_in  := now();
    new.clock_out := null;
    new.clocked_out_by    := null;
    new.original_clock_in  := null;
    new.original_clock_out := null;
  end if;

  if new.mode = 'drop_off' and new.job_id is null then
    raise exception 'Pick the job site you are dropping them at';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_team_member_shift_insert on team_member_shifts;
create trigger trg_guard_team_member_shift_insert
  before insert on team_member_shifts
  for each row execute function guard_team_member_shift_insert();

-- ── Changes: only a clock-out for everyone but admins ─────────
create or replace function guard_team_member_shift_update()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_admin boolean := auth.uid() is null or get_my_role() = 'admin';
  v_me       uuid;
begin
  select id into v_me from profiles where auth_user_id = auth.uid() limit 1;

  if not v_is_admin then
    if old.clock_out is not null then
      raise exception 'Only an admin can change a recorded clock-out time';
    end if;
    -- Everything except the clock-out is fixed once recorded.
    new.company_id     := old.company_id;
    new.team_member_id := old.team_member_id;
    new.clock_in       := old.clock_in;
    new.mode           := old.mode;
    new.job_id         := old.job_id;
    new.site_label     := old.site_label;
    new.clocked_in_by  := old.clocked_in_by;
    new.in_lat         := old.in_lat;
    new.in_lng         := old.in_lng;
    new.original_clock_in  := old.original_clock_in;
    new.original_clock_out := old.original_clock_out;
    if new.clock_out is not null then
      new.clock_out      := now();
      new.clocked_out_by := v_me;
    else
      new.clocked_out_by := old.clocked_out_by;
    end if;
    return new;
  end if;

  -- Admin correcting a recorded time: keep the first value.
  if old.clock_in is distinct from new.clock_in and old.original_clock_in is null then
    new.original_clock_in := old.clock_in;
  end if;
  if old.clock_out is not null and new.clock_out is distinct from old.clock_out
     and old.original_clock_out is null then
    new.original_clock_out := old.clock_out;
  end if;
  -- An admin's own clock-out (empty -> time) is stamped like anyone's.
  if old.clock_out is null and new.clock_out is not null and new.clocked_out_by is null then
    new.clocked_out_by := v_me;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_team_member_shift_update on team_member_shifts;
create trigger trg_guard_team_member_shift_update
  before update on team_member_shifts
  for each row execute function guard_team_member_shift_update();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
