-- ──────────────────────────────────────────────────────────────
-- FACE CLOCK-IN — SOFT CHECK (log + flag, never blocks).
--
-- People clock in on their own phone with a quick selfie. The phone
-- turns the face into a list of 128 numbers (a "template"); nothing
-- here ever stores or compares a photo of the face itself.
--
--   face_templates   who has enrolled (3 samples each). Technicians /
--                    admins AND team members (helpers). RLS is on with
--                    NO policies, so the browser can never read a
--                    template — only the functions below can.
--   face_checks      one row per clock event that was checked: the
--                    verdict, the selfie (private bucket) and whether
--                    an admin has reviewed it.
--
-- The VERDICT is worked out here, by face_record_check, from the live
-- numbers the phone sends — the same pattern as the site geofence — so
-- the browser can't just announce "match". It stays a soft check:
-- nothing here ever rejects a clock-in. A mismatch, or a skipped check,
-- is FLAGGED for an admin; it does not stop the work.
--
--   status        match         same person as the enrolled face
--                 mismatch      different face -> FLAGGED
--                 skipped       enrolled, but no check was done
--                               (camera blocked / no face found) -> FLAGGED
--                 not_enrolled  nothing to compare against yet
--   liveness      false when the blink test was bypassed -> FLAGGED
--
-- Team members have no login and no clock of their own. They are
-- identified on the TECHNICIAN'S phone (face_identify_team_member) and
-- still ride the technician's on-site window — see
-- 20260903090000_team_members.sql.
--
-- Biometric data is "special personal information" under POPIA, so a
-- template can only be stored with consent (p_consent), and an admin
-- can erase one at any time (face_remove).
--
-- Safe to run twice.
-- ──────────────────────────────────────────────────────────────

-- ── Tables ─────────────────────────────────────────────────────
create table if not exists face_templates (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references companies(id) on delete cascade,
  profile_id       uuid references profiles(id) on delete cascade,
  team_member_id   uuid references team_members(id) on delete cascade,
  descriptor       real[] not null check (array_length(descriptor, 1) = 128),
  -- The selfie taken while enrolling, so an admin can see who actually
  -- stood in front of the camera.
  photo_path       text,
  -- Deliberately NOT foreign keys to profiles (a second FK would make
  -- every `profiles(...)` embed on this table ambiguous).
  enrolled_by      uuid,
  enrolled_by_name text,
  consent_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  constraint face_templates_one_subject check ((profile_id is null) <> (team_member_id is null))
);

create index if not exists face_templates_company_id_idx     on face_templates (company_id);
create index if not exists face_templates_profile_id_idx     on face_templates (profile_id);
create index if not exists face_templates_team_member_id_idx on face_templates (team_member_id);

create table if not exists face_checks (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid references companies(id) on delete cascade,
  kind              text not null check (kind in ('shift_in', 'shift_out', 'site_in', 'site_out', 'team_in')),
  -- Who the check is about: the person clocking, or (team_in) the helper.
  profile_id        uuid references profiles(id) on delete cascade,
  team_member_id    uuid references team_members(id) on delete cascade,
  -- What it was attached to.
  shift_id          uuid references work_shifts(id) on delete cascade,
  assignment_id     uuid references appointment_assignments(id) on delete cascade,
  status            text not null check (status in ('match', 'mismatch', 'skipped', 'not_enrolled')),
  distance          real,
  liveness          boolean,
  skip_reason       text,
  photo_path        text,
  -- Whose phone it was (for team_in this is the technician).
  recorded_by       uuid,
  recorded_by_name  text,
  reviewed_by       uuid,
  reviewed_by_name  text,
  reviewed_at       timestamptz,
  review_note       text,
  flagged           boolean generated always as (status in ('mismatch', 'skipped') or liveness is false) stored,
  created_at        timestamptz not null default now(),
  constraint face_checks_one_subject check ((profile_id is null) <> (team_member_id is null))
);

create index if not exists face_checks_company_created_idx on face_checks (company_id, created_at desc);
create index if not exists face_checks_profile_id_idx      on face_checks (profile_id);
create index if not exists face_checks_team_member_id_idx  on face_checks (team_member_id);
create index if not exists face_checks_shift_id_idx        on face_checks (shift_id);
create index if not exists face_checks_assignment_id_idx   on face_checks (assignment_id);
create index if not exists face_checks_flagged_idx         on face_checks (company_id) where flagged and reviewed_at is null;

-- ── Row level security ─────────────────────────────────────────
alter table face_templates enable row level security;   -- no policies: functions only
alter table face_checks    enable row level security;

-- Admins see every check in the company; a person sees their own and
-- the ones recorded on their own phone. All WRITES go through the
-- functions below, so there is no insert / update / delete policy.
drop policy if exists "face_checks_select" on face_checks;
create policy "face_checks_select"
  on face_checks for select
  using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or profile_id = get_my_profile_id()
      or recorded_by = get_my_profile_id()
    )
  );

-- ── Maths helpers (not callable from the browser) ──────────────
-- How different two faces may be and still count as the same person.
-- Euclidean distance between the two 128-number templates: the face
-- model's own guidance is 0.6; stricter is safer against a stand-in,
-- looser fails honest people in bad light. Change it here, no app
-- release needed.
create or replace function face_match_threshold()
returns real
language sql
immutable
as $$ select 0.5::real; $$;

create or replace function face_distance(a real[], b real[])
returns double precision
language sql
immutable
as $$
  select sqrt(sum(power((x - y)::double precision, 2)))
  from unnest(a, b) as t(x, y);
$$;

create or replace function face_to_vector(p jsonb)
returns real[]
language plpgsql
immutable
as $$
declare
  v real[];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 128 then
    raise exception 'A face template must be exactly 128 numbers';
  end if;
  select array_agg(x::real order by ord) into v
    from jsonb_array_elements_text(p) with ordinality as t(x, ord);
  return v;
end;
$$;

-- Closest enrolled sample for one person / team member (null = none).
create or replace function face_best_distance(p_vec real[], p_profile_id uuid, p_team_member_id uuid)
returns real
language sql
stable
security definer
set search_path = public
as $$
  select min(face_distance(t.descriptor, p_vec))::real
  from   face_templates t
  where  t.profile_id     is not distinct from p_profile_id
    and  t.team_member_id is not distinct from p_team_member_id;
$$;

revoke execute on function face_distance(real[], real[])                   from public, anon, authenticated;
revoke execute on function face_to_vector(jsonb)                           from public, anon, authenticated;
revoke execute on function face_best_distance(real[], uuid, uuid)          from public, anon, authenticated;

-- ── Enrol ──────────────────────────────────────────────────────
-- Stores 1-5 samples of one face. An admin can enrol or RE-enrol
-- anyone in the company. Anyone else may enrol only themselves, or a
-- team member, and only while that person has no face on file yet —
-- once set, changing it is an admin's call.
create or replace function face_enrol(
  p_profile_id     uuid,
  p_team_member_id uuid,
  p_descriptors    jsonb,
  p_photo_path     text,
  p_consent        boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid    := get_my_profile_id();
  v_company uuid    := get_my_company_id();
  v_admin   boolean := get_my_role() = 'admin';
  v_name    text;
  v_item    jsonb;
  v_count   integer := 0;
begin
  if v_me is null or v_company is null then
    raise exception 'Not signed in';
  end if;
  if (p_profile_id is null) = (p_team_member_id is null) then
    raise exception 'Choose either a person or a team member';
  end if;
  if p_consent is not true then
    raise exception 'Consent is needed before a face can be stored';
  end if;
  if p_descriptors is null or jsonb_typeof(p_descriptors) <> 'array'
     or jsonb_array_length(p_descriptors) not between 1 and 5 then
    raise exception 'Send between 1 and 5 face samples';
  end if;
  if p_photo_path is not null and p_photo_path not like v_company::text || '/%' then
    raise exception 'Invalid photo path';
  end if;

  if p_profile_id is not null then
    if not exists (select 1 from profiles where id = p_profile_id and company_id = v_company) then
      raise exception 'Person not found';
    end if;
    if not v_admin and p_profile_id <> v_me then
      raise exception 'Only an admin can set up someone else''s face';
    end if;
  elsif not exists (select 1 from team_members where id = p_team_member_id and company_id = v_company) then
    raise exception 'Team member not found';
  end if;

  if exists (
    select 1 from face_templates
     where profile_id is not distinct from p_profile_id
       and team_member_id is not distinct from p_team_member_id
  ) then
    if not v_admin then
      raise exception 'A face is already set up — ask an admin to reset it';
    end if;
    delete from face_templates
     where profile_id is not distinct from p_profile_id
       and team_member_id is not distinct from p_team_member_id;
  end if;

  select full_name into v_name from profiles where id = v_me;

  for v_item in select * from jsonb_array_elements(p_descriptors) loop
    insert into face_templates (company_id, profile_id, team_member_id, descriptor, photo_path, enrolled_by, enrolled_by_name)
    values (v_company, p_profile_id, p_team_member_id, face_to_vector(v_item), p_photo_path, v_me, coalesce(v_name, 'Unknown'));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── Record one clock-event check ───────────────────────────────
-- Called AFTER the clock event, with the live numbers from the phone
-- (or none, when the check was skipped). Always about the caller's own
-- shift / visit; for team_in the subject is the helper being clocked on.
create or replace function face_record_check(
  p_kind           text,
  p_shift_id       uuid    default null,
  p_assignment_id  uuid    default null,
  p_team_member_id uuid    default null,
  p_descriptor     jsonb   default null,
  p_photo_path     text    default null,
  p_liveness       boolean default null,
  p_skip_reason    text    default null,
  out o_check_id   uuid,
  out o_status     text,
  out o_distance   real
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := get_my_profile_id();
  v_company  uuid := get_my_company_id();
  v_name     text;
  v_profile  uuid;
  v_team     uuid;
  v_enrolled boolean;
begin
  if v_me is null or v_company is null then
    raise exception 'Not signed in';
  end if;
  if p_kind is null or p_kind not in ('shift_in', 'shift_out', 'site_in', 'site_out', 'team_in') then
    raise exception 'Unknown check type';
  end if;
  if p_photo_path is not null and p_photo_path not like v_company::text || '/%' then
    raise exception 'Invalid photo path';
  end if;

  select full_name into v_name from profiles where id = v_me;

  -- The check has to be about the caller's own clock event.
  if p_kind in ('shift_in', 'shift_out') then
    if p_shift_id is null or not exists (
      select 1 from work_shifts where id = p_shift_id and technician_id = v_me
    ) then
      raise exception 'That shift is not yours';
    end if;
    p_assignment_id := null;
    v_profile := v_me;
  elsif p_kind in ('site_in', 'site_out') then
    if p_assignment_id is null or not exists (
      select 1 from appointment_assignments where id = p_assignment_id and technician_id = v_me
    ) then
      raise exception 'That visit is not yours';
    end if;
    p_shift_id := null;
    v_profile := v_me;
  else
    if p_assignment_id is null or p_team_member_id is null or not exists (
      select 1
        from appointment_assignments a
        join assignment_team_members atm on atm.assignment_id = a.id
       where a.id = p_assignment_id
         and a.technician_id = v_me
         and atm.team_member_id = p_team_member_id
    ) then
      raise exception 'That team member is not on your visit';
    end if;
    p_shift_id := null;
    v_team := p_team_member_id;
  end if;

  select exists (
    select 1 from face_templates
     where profile_id is not distinct from v_profile
       and team_member_id is not distinct from v_team
  ) into v_enrolled;

  if not v_enrolled then
    o_status := 'not_enrolled';
  elsif p_descriptor is null then
    o_status := 'skipped';
  else
    o_distance := face_best_distance(face_to_vector(p_descriptor), v_profile, v_team);
    o_status := case when o_distance <= face_match_threshold() then 'match' else 'mismatch' end;
  end if;

  insert into face_checks (
    company_id, kind, profile_id, team_member_id, shift_id, assignment_id,
    status, distance, liveness, skip_reason, photo_path, recorded_by, recorded_by_name
  ) values (
    v_company, p_kind, v_profile, v_team, p_shift_id, p_assignment_id,
    o_status, o_distance, p_liveness, nullif(btrim(p_skip_reason), ''), p_photo_path, v_me, coalesce(v_name, 'Unknown')
  )
  returning id into o_check_id;
end;
$$;

-- ── Who is this helper? (team members, on the technician's phone) ──
-- Returns the closest ACTIVE team member if they are clearly the same
-- person, and nothing when it's a stranger or when two team members
-- look too alike to tell apart — never guess between two people.
create or replace function face_identify_team_member(p_descriptor jsonb)
returns table (o_team_member_id uuid, o_full_name text, o_distance real)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid := get_my_company_id();
  v_vec     real[];
begin
  if get_my_profile_id() is null or v_company is null then
    raise exception 'Not signed in';
  end if;
  v_vec := face_to_vector(p_descriptor);

  return query
    with best as (
      select t.team_member_id as tm, min(face_distance(t.descriptor, v_vec)) as dist
        from face_templates t
        join team_members m on m.id = t.team_member_id
       where t.company_id = v_company and m.is_active
       group by t.team_member_id
    ),
    ranked as (
      select tm, dist,
             row_number() over (order by dist) as rn,
             lead(dist)   over (order by dist) as next_dist
        from best
    )
    select r.tm, m.full_name, r.dist::real
      from ranked r
      join team_members m on m.id = r.tm
     where r.rn = 1
       and r.dist <= face_match_threshold()
       and (r.next_dist is null or r.next_dist - r.dist >= 0.04);
end;
$$;

-- ── Who has enrolled? (ids only, never templates) ──────────────
create or replace function face_enrolment_overview()
returns table (
  o_profile_id       uuid,
  o_team_member_id   uuid,
  o_templates        integer,
  o_enrolled_at      timestamptz,
  o_enrolled_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.profile_id,
         t.team_member_id,
         count(*)::integer,
         max(t.created_at),
         (array_agg(t.enrolled_by_name order by t.created_at desc))[1]
    from face_templates t
   where t.company_id = get_my_company_id()
   group by t.profile_id, t.team_member_id;
$$;

-- ── Erase a face (admin) ───────────────────────────────────────
create or replace function face_remove(p_profile_id uuid, p_team_member_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can remove a face';
  end if;
  if (p_profile_id is null) = (p_team_member_id is null) then
    raise exception 'Choose either a person or a team member';
  end if;
  delete from face_templates
   where company_id = get_my_company_id()
     and profile_id is not distinct from p_profile_id
     and team_member_id is not distinct from p_team_member_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── Mark a flagged check as reviewed (admin) ───────────────────
create or replace function face_review_check(p_check_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := get_my_profile_id();
  v_name text;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can review a face check';
  end if;
  select full_name into v_name from profiles where id = v_me;
  update face_checks
     set reviewed_by      = v_me,
         reviewed_by_name = coalesce(v_name, 'An admin'),
         reviewed_at      = now(),
         review_note      = nullif(btrim(p_note), '')
   where id = p_check_id
     and company_id = get_my_company_id();
  if not found then
    raise exception 'Face check not found';
  end if;
end;
$$;

-- Only signed-in users may call the entry points.
revoke execute on function face_enrol(uuid, uuid, jsonb, text, boolean)                                  from public, anon;
revoke execute on function face_record_check(text, uuid, uuid, uuid, jsonb, text, boolean, text)         from public, anon;
revoke execute on function face_identify_team_member(jsonb)                                              from public, anon;
revoke execute on function face_enrolment_overview()                                                     from public, anon;
revoke execute on function face_remove(uuid, uuid)                                                       from public, anon;
revoke execute on function face_review_check(uuid, text)                                                 from public, anon;
grant  execute on function face_enrol(uuid, uuid, jsonb, text, boolean)                                  to authenticated;
grant  execute on function face_record_check(text, uuid, uuid, uuid, jsonb, text, boolean, text)         to authenticated;
grant  execute on function face_identify_team_member(jsonb)                                              to authenticated;
grant  execute on function face_enrolment_overview()                                                     to authenticated;
grant  execute on function face_remove(uuid, uuid)                                                       to authenticated;
grant  execute on function face_review_check(uuid, text)                                                 to authenticated;

-- ── Selfie storage — private. Path: {company_id}/{yyyy-mm}/{file}.jpg ──
insert into storage.buckets (id, name, public)
values ('face-checks', 'face-checks', false)
on conflict (id) do nothing;

-- Only admins can look at the selfies. Anyone signed in can add one
-- to their own company's folder; only admins can delete.
drop policy if exists "face_checks_storage_select" on storage.objects;
create policy "face_checks_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'face-checks'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and get_my_role() = 'admin'
  );

drop policy if exists "face_checks_storage_insert" on storage.objects;
create policy "face_checks_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'face-checks'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

drop policy if exists "face_checks_storage_delete" on storage.objects;
create policy "face_checks_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'face-checks'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and get_my_role() = 'admin'
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
