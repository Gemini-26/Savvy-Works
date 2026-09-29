-- ──────────────────────────────────────────────────────────────
-- ADMIN CLOCK-TIME ADJUSTMENTS — technicians often tap "clock in"
-- an hour or two after they actually reached site, which short-pays
-- them and the team members riding their on-site window. Admins can
-- now correct appointment_assignments.actual_start / actual_end.
--
-- The rule is enforced here rather than in the UI, because the
-- appointment_assignments RLS policy lets any company user update
-- the row (technicians need that to clock in/out):
--   • Admins (and the service role) may set, change or clear times.
--   • Everyone else may only fill an EMPTY clock, and the value is
--     stamped with the server's now() — a wrong phone clock or a
--     hand-crafted request can't backdate it. Changing or clearing a
--     recorded time raises an error.
--
-- The first time an admin changes a recorded time, the original is
-- kept in original_actual_start / original_actual_end, so payroll
-- can always see what the technician actually tapped.
-- ──────────────────────────────────────────────────────────────

alter table appointment_assignments
  add column if not exists original_actual_start timestamptz,
  add column if not exists original_actual_end   timestamptz,
  -- Deliberately NOT a foreign key: a second FK to profiles would make
  -- every existing `profiles(...)` embed on this table ambiguous in
  -- PostgREST and break the planner/technician queries. The name is
  -- stored alongside so screens don't need a join.
  add column if not exists times_adjusted_by      uuid,
  add column if not exists times_adjusted_by_name text,
  add column if not exists times_adjusted_at      timestamptz;

create or replace function guard_assignment_clock_times()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_admin boolean := auth.uid() is null or get_my_role() = 'admin';
begin
  if new.actual_start is not distinct from old.actual_start
     and new.actual_end is not distinct from old.actual_end then
    return new;
  end if;

  if not v_is_admin then
    if new.actual_start is distinct from old.actual_start then
      if old.actual_start is not null then
        raise exception 'Only an admin can change a recorded clock-in time';
      end if;
      new.actual_start := now();
    end if;
    if new.actual_end is distinct from old.actual_end then
      if old.actual_end is not null then
        raise exception 'Only an admin can change a recorded clock-out time';
      end if;
      new.actual_end := now();
    end if;
    -- Audit columns are admin-only too.
    new.original_actual_start := old.original_actual_start;
    new.original_actual_end   := old.original_actual_end;
    new.times_adjusted_by      := old.times_adjusted_by;
    new.times_adjusted_by_name := old.times_adjusted_by_name;
    new.times_adjusted_at      := old.times_adjusted_at;
    return new;
  end if;

  -- Admin edit of a time that was already recorded: keep the first
  -- original, and stamp who made the change.
  if old.actual_start is not null and new.actual_start is distinct from old.actual_start
     and old.original_actual_start is null then
    new.original_actual_start := old.actual_start;
  end if;
  if old.actual_end is not null and new.actual_end is distinct from old.actual_end
     and old.original_actual_end is null then
    new.original_actual_end := old.actual_end;
  end if;

  if new.actual_end is not null and new.actual_start is not null
     and new.actual_end <= new.actual_start then
    raise exception 'Clock-out must be after clock-in';
  end if;

  -- Only a change to an already-recorded time counts as an adjustment;
  -- an admin's own normal clock-out (empty -> now) does not.
  if auth.uid() is not null
     and ((old.actual_start is not null and new.actual_start is distinct from old.actual_start)
       or (old.actual_end   is not null and new.actual_end   is distinct from old.actual_end)) then
    select id, full_name into new.times_adjusted_by, new.times_adjusted_by_name
      from profiles where auth_user_id = auth.uid() limit 1;
    new.times_adjusted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_assignment_clock_times on appointment_assignments;
create trigger trg_guard_assignment_clock_times
  before update on appointment_assignments
  for each row execute function guard_assignment_clock_times();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
