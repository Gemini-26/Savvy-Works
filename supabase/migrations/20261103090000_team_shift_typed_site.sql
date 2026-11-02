-- ──────────────────────────────────────────────────────────────
-- TEAM MEMBER DROP-OFFS — a technician can now type the job number or
-- job site they are dropping someone at ("+ Add job site"), instead of
-- only picking an existing job. A drop-off now needs EITHER a job OR
-- some site text; the text is what shows on the timesheet.
--
-- Only the insert guard changes (same as 20261102090000 apart from the
-- drop-off rule and trimming the text).
-- ──────────────────────────────────────────────────────────────

alter table team_member_shifts drop constraint if exists team_member_shifts_site_label_len_chk;
alter table team_member_shifts add constraint team_member_shifts_site_label_len_chk
  check (site_label is null or char_length(site_label) <= 200);

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
  new.site_label    := nullif(btrim(new.site_label), '');

  if not v_is_admin then
    -- Always "now", and never created already closed.
    new.clock_in  := now();
    new.clock_out := null;
    new.clocked_out_by    := null;
    new.original_clock_in  := null;
    new.original_clock_out := null;
  end if;

  if new.mode = 'drop_off' and new.job_id is null and new.site_label is null then
    raise exception 'Pick or type the job site you are dropping them at';
  end if;
  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
