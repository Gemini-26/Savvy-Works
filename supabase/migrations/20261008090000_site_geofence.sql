-- ──────────────────────────────────────────────────────────────
-- SITE GEOFENCE — SOFT CHECK (log + flag, never blocks).
--
-- 1. Every job now carries the coordinates of its site and a fence
--    radius, so "is this technician actually at the job?" is a
--    distance calculation instead of a guess from the address.
--       site_lat / site_lng  where the site is
--       site_radius_m        how close counts as "on site"
--       site_geo_source      how the point was found:
--           'address'  geocoded from the full address
--           'approx'   geocoder only matched the estate / suburb,
--                      so the point may be hundreds of metres out
--           'pin'      an admin dropped or confirmed it on the map
--
-- 2. When a technician clocks in or out on site, the app sends the
--    phone's GPS fix with the update. THIS file's trigger works out
--    the distance and a status on the server, so the verdict can't
--    be written by the client. Statuses:
--           inside         within the fence (GPS tolerance included)
--           outside        beyond the fence  -> FLAGGED
--           unverified     beyond the fence, but the site point is
--                          only 'approx' -> logged, not flagged
--           low_accuracy   phone's fix too vague to judge
--           no_gps         technician's phone sent no location
--           no_site_pin    the job has no coordinates yet
--           admin_entered  an admin clocked/entered it, so there is
--                          no technician location to compare
--
-- 3. Admins can mark a flag as reviewed (with a note).
--
-- Nothing here ever rejects a clock-in. It is safe to run twice.
-- ──────────────────────────────────────────────────────────────

-- ── Site coordinates on jobs ───────────────────────────────────
alter table jobs
  add column if not exists site_lat       double precision,
  add column if not exists site_lng       double precision,
  add column if not exists site_radius_m  integer not null default 150,
  add column if not exists site_geo_source text;

alter table jobs drop constraint if exists jobs_site_geo_chk;
alter table jobs add constraint jobs_site_geo_chk check (
  (site_lat is null or site_lat between -90 and 90)
  and (site_lng is null or site_lng between -180 and 180)
  and site_radius_m between 25 and 5000
  and (site_geo_source is null or site_geo_source in ('address', 'approx', 'pin'))
);

-- jobs_update_company lets an ASSIGNED TECHNICIAN update the job row
-- (they need that to complete a job). Without this guard they could
-- also drag the fence to wherever they are standing, so only admins
-- (and the service role) may change the site location.
create or replace function guard_job_site_geo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    new.site_lat        := old.site_lat;
    new.site_lng        := old.site_lng;
    new.site_radius_m   := old.site_radius_m;
    new.site_geo_source := old.site_geo_source;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_job_site_geo on jobs;
create trigger trg_guard_job_site_geo
  before update on jobs
  for each row execute function guard_job_site_geo();

-- ── What gets recorded at each clock-in / clock-out ────────────
alter table appointment_assignments
  add column if not exists start_lat         double precision,
  add column if not exists start_lng         double precision,
  add column if not exists start_accuracy_m  integer,
  add column if not exists start_distance_m  integer,
  add column if not exists start_fence_m     integer,
  add column if not exists start_geo_status  text,
  add column if not exists end_lat           double precision,
  add column if not exists end_lng           double precision,
  add column if not exists end_accuracy_m    integer,
  add column if not exists end_distance_m    integer,
  add column if not exists end_fence_m       integer,
  add column if not exists end_geo_status    text,
  -- Deliberately NOT a foreign key to profiles (see
  -- 20260929090000_admin_clock_time_adjustments.sql): a second FK would
  -- make every `profiles(...)` embed on this table ambiguous.
  add column if not exists geo_reviewed_by      uuid,
  add column if not exists geo_reviewed_by_name text,
  add column if not exists geo_reviewed_at      timestamptz,
  add column if not exists geo_review_note      text;

-- Great-circle distance in metres between two lat/lng points.
create or replace function geo_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- The verdict for one position against one visit's job site.
create or replace function geo_fence_check(
  p_appointment_id uuid,
  p_lat            double precision,
  p_lng            double precision,
  p_accuracy       integer,
  p_actor_is_tech  boolean,
  out o_status     text,
  out o_distance   integer,
  out o_fence      integer
)
language plpgsql
stable
as $$
declare
  j record;
  d double precision;
begin
  select jb.site_lat, jb.site_lng, jb.site_radius_m, jb.site_geo_source
    into j
    from appointments a
    join jobs jb on jb.id = a.job_id
   where a.id = p_appointment_id;

  o_fence := j.site_radius_m;

  -- An admin tapping the button for someone: their phone is not the
  -- technician's, so there is nothing meaningful to compare.
  if not p_actor_is_tech then
    o_status := 'admin_entered';
  elsif p_lat is null or p_lng is null then
    o_status := 'no_gps';
  elsif j.site_lat is null or j.site_lng is null then
    o_status := 'no_site_pin';
  else
    d := geo_distance_m(p_lat, p_lng, j.site_lat, j.site_lng);
    o_distance := round(d);
    if p_accuracy is not null and p_accuracy > 250 then
      o_status := 'low_accuracy';
    -- Benefit of the doubt: the fix is only "outside" if even its own
    -- reported uncertainty can't bring it back inside the fence.
    elsif d <= j.site_radius_m + coalesce(p_accuracy, 0) then
      o_status := 'inside';
    elsif j.site_geo_source = 'approx' then
      o_status := 'unverified';
    else
      o_status := 'outside';
    end if;
  end if;
end;
$$;

-- Runs on every update of an assignment. It only acts when a clock-in
-- or clock-out is being RECORDED (empty -> set); at every other time the
-- geo columns are frozen, so neither a technician nor a hand-crafted
-- request can rewrite a recorded verdict afterwards.
create or replace function assignment_geo_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := auth.uid() is null or get_my_role() = 'admin';
  v_is_tech  boolean := exists (
    select 1 from profiles
     where auth_user_id = auth.uid() and id = new.technician_id
  );
  r record;
begin
  -- ── review (admin only) ─────────────────────────────────────
  -- Handled first: a new clock-in / clock-out below resets it, and that
  -- reset has to win over "keep the old review" for non-admins.
  if not v_is_admin then
    new.geo_reviewed_by      := old.geo_reviewed_by;
    new.geo_reviewed_by_name := old.geo_reviewed_by_name;
    new.geo_reviewed_at      := old.geo_reviewed_at;
    new.geo_review_note      := old.geo_review_note;
  elsif new.geo_reviewed_at is null then
    new.geo_reviewed_by := null;  new.geo_reviewed_by_name := null;  new.geo_review_note := null;
  elsif new.geo_reviewed_at is distinct from old.geo_reviewed_at then
    select id, full_name into new.geo_reviewed_by, new.geo_reviewed_by_name
      from profiles where auth_user_id = auth.uid() limit 1;
  end if;

  -- ── clock-in ────────────────────────────────────────────────
  if new.actual_start is null then
    -- Cleared by an admin: the check no longer describes anything.
    new.start_lat := null;  new.start_lng := null;  new.start_accuracy_m := null;
    new.start_distance_m := null;  new.start_fence_m := null;  new.start_geo_status := null;
  elsif old.actual_start is null then
    select * into r from geo_fence_check(
      new.appointment_id, new.start_lat, new.start_lng, new.start_accuracy_m, v_is_tech);
    new.start_geo_status := r.o_status;
    new.start_distance_m := r.o_distance;
    new.start_fence_m    := r.o_fence;
    if not v_is_tech then
      -- Keep an admin's own location out of the technician's record.
      new.start_lat := null;  new.start_lng := null;  new.start_accuracy_m := null;
    end if;
    new.geo_reviewed_by := null;  new.geo_reviewed_by_name := null;
    new.geo_reviewed_at := null;  new.geo_review_note := null;
  else
    new.start_lat := old.start_lat;  new.start_lng := old.start_lng;
    new.start_accuracy_m := old.start_accuracy_m;  new.start_distance_m := old.start_distance_m;
    new.start_fence_m := old.start_fence_m;  new.start_geo_status := old.start_geo_status;
  end if;

  -- ── clock-out ───────────────────────────────────────────────
  if new.actual_end is null then
    new.end_lat := null;  new.end_lng := null;  new.end_accuracy_m := null;
    new.end_distance_m := null;  new.end_fence_m := null;  new.end_geo_status := null;
  elsif old.actual_end is null then
    select * into r from geo_fence_check(
      new.appointment_id, new.end_lat, new.end_lng, new.end_accuracy_m, v_is_tech);
    new.end_geo_status := r.o_status;
    new.end_distance_m := r.o_distance;
    new.end_fence_m    := r.o_fence;
    if not v_is_tech then
      new.end_lat := null;  new.end_lng := null;  new.end_accuracy_m := null;
    end if;
    -- A fresh result needs a fresh look.
    new.geo_reviewed_by := null;  new.geo_reviewed_by_name := null;
    new.geo_reviewed_at := null;  new.geo_review_note := null;
  else
    new.end_lat := old.end_lat;  new.end_lng := old.end_lng;
    new.end_accuracy_m := old.end_accuracy_m;  new.end_distance_m := old.end_distance_m;
    new.end_fence_m := old.end_fence_m;  new.end_geo_status := old.end_geo_status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assignment_geo_check on appointment_assignments;
create trigger trg_assignment_geo_check
  before update on appointment_assignments
  for each row execute function assignment_geo_check();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
