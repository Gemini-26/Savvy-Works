-- ──────────────────────────────────────────────────────────────
-- ADMIN DAY-SHIFT ADJUSTMENTS — same idea as the on-site clock fix
-- (20260929090000), for work_shifts.clock_in / clock_out.
--
-- work_shifts_update_own_or_admin lets a technician update their
-- own shift row (they need that to clock out), which also let them
-- rewrite their own times. Now:
--   • Admins (and the service role) may change clock_in / clock_out
--     on anyone's shift, including their own.
--   • Everyone else: clock_in is stamped with the server's now() on
--     insert, clock_out may only go from empty to now(), and a
--     recorded time can't be changed.
--
-- The first admin change keeps the originals, who made it, and why.
-- ──────────────────────────────────────────────────────────────

alter table work_shifts
  add column if not exists original_clock_in      timestamptz,
  add column if not exists original_clock_out     timestamptz,
  -- Not a foreign key: work_shifts already has two FKs to profiles,
  -- and a third would force every embed to be re-hinted.
  add column if not exists times_adjusted_by      uuid,
  add column if not exists times_adjusted_by_name text,
  add column if not exists times_adjusted_at      timestamptz,
  add column if not exists adjustment_reason      text;

create or replace function guard_work_shift_times()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_admin boolean := auth.uid() is null or get_my_role() = 'admin';
begin
  if tg_op = 'INSERT' then
    if not v_is_admin then
      new.clock_in  := now();
      new.clock_out := null;
      new.original_clock_in := null;
      new.original_clock_out := null;
      new.times_adjusted_by := null;
      new.times_adjusted_by_name := null;
      new.times_adjusted_at := null;
      new.adjustment_reason := null;
    end if;
    return new;
  end if;

  if not v_is_admin then
    if new.clock_in is distinct from old.clock_in then
      raise exception 'Only an admin can change a recorded clock-in time';
    end if;
    if new.clock_out is distinct from old.clock_out then
      if old.clock_out is not null then
        raise exception 'Only an admin can change a recorded clock-out time';
      end if;
      new.clock_out := now();
    end if;
    new.original_clock_in      := old.original_clock_in;
    new.original_clock_out     := old.original_clock_out;
    new.times_adjusted_by      := old.times_adjusted_by;
    new.times_adjusted_by_name := old.times_adjusted_by_name;
    new.times_adjusted_at      := old.times_adjusted_at;
    new.adjustment_reason      := old.adjustment_reason;
    return new;
  end if;

  if new.clock_out is not null and new.clock_out <= new.clock_in then
    raise exception 'Clock-out must be after clock-in';
  end if;

  if new.clock_in is distinct from old.clock_in and old.original_clock_in is null then
    new.original_clock_in := old.clock_in;
  end if;
  if old.clock_out is not null and new.clock_out is distinct from old.clock_out
     and old.original_clock_out is null then
    new.original_clock_out := old.clock_out;
  end if;

  -- Only a change to an already-recorded time is an adjustment; an
  -- admin's own normal clock-out (empty -> now) is not.
  if auth.uid() is not null
     and (new.clock_in is distinct from old.clock_in
       or (old.clock_out is not null and new.clock_out is distinct from old.clock_out)) then
    select id, full_name into new.times_adjusted_by, new.times_adjusted_by_name
      from profiles where auth_user_id = auth.uid() limit 1;
    new.times_adjusted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_work_shift_times on work_shifts;
create trigger trg_guard_work_shift_times
  before insert or update on work_shifts
  for each row execute function guard_work_shift_times();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
