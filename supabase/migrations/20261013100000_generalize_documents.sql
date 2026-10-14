-- ──────────────────────────────────────────────────────────────
-- DOCUMENTS FOR EVERYONE — widen the per-person "My Documents"
-- tables so the same explorer also serves:
--   • team members (labourers/helpers: no login, admin-only), and
--   • the company itself (Digital Documents under File Manager,
--     admin-only).
--
-- Who owns a row:
--     profile_id set        → a person with a login (they can READ their own)
--     team_member_id set    → a team member           (admins only)
--     both null             → the company's own files (admins only)
-- Nothing changes for what already exists: every current row keeps its
-- profile_id and behaves exactly as before.
--
-- The tables are renamed profile_* → document_* because they no longer
-- belong to profiles alone. (Not deployed to users yet, so nothing else
-- depends on the old names.) Everything runs in one transaction: it
-- either all happens or none of it does.
-- ──────────────────────────────────────────────────────────────
begin;

-- 1. RENAME ───────────────────────────────────────────────────
alter table profile_folders           rename to document_folders;
alter table profile_files             rename to document_files;
alter table profile_document_activity rename to document_activity;

alter table document_files rename constraint profile_files_uploaded_by_fkey to document_files_uploaded_by_fkey;

drop policy if exists "profile_folders_select"               on document_folders;
drop policy if exists "profile_folders_admin_write"          on document_folders;
drop policy if exists "profile_files_select"                 on document_files;
drop policy if exists "profile_files_admin_write"            on document_files;
drop policy if exists "profile_document_activity_select"     on document_activity;
drop policy if exists "profile_document_activity_insert"     on document_activity;

-- 2. OWNERSHIP COLUMNS ────────────────────────────────────────
alter table document_folders  alter column profile_id drop not null;
alter table document_files    alter column profile_id drop not null;
alter table document_activity alter column profile_id drop not null;

alter table document_folders  add column team_member_id uuid references team_members(id) on delete cascade;
alter table document_files    add column team_member_id uuid references team_members(id) on delete cascade;
alter table document_activity add column team_member_id uuid references team_members(id) on delete cascade;

alter table document_folders  add constraint document_folders_one_owner  check (num_nonnulls(profile_id, team_member_id) <= 1);
alter table document_files    add constraint document_files_one_owner    check (num_nonnulls(profile_id, team_member_id) <= 1);
alter table document_activity add constraint document_activity_one_owner check (num_nonnulls(profile_id, team_member_id) <= 1);

-- One always-filled value naming the owner (person, team member, or — for
-- company files — the company), so a file can be forced to live under a
-- folder with the SAME owner.
alter table document_folders add column owner_key uuid generated always as (coalesce(profile_id, team_member_id, company_id)) stored;
alter table document_files   add column owner_key uuid generated always as (coalesce(profile_id, team_member_id, company_id)) stored;

alter table document_files   drop constraint profile_files_folder_fkey;
alter table document_folders drop constraint profile_folders_parent_fkey;
alter table document_folders drop constraint profile_folders_id_profile_key;

alter table document_folders add constraint document_folders_id_owner_key unique (id, owner_key);
alter table document_folders add constraint document_folders_parent_fkey
  foreign key (parent_id, owner_key) references document_folders (id, owner_key) on delete cascade;
alter table document_files   add constraint document_files_folder_fkey
  foreign key (folder_id, owner_key) references document_folders (id, owner_key) on delete cascade;

-- Same-name-side-by-side rule, now per owner.
drop index if exists profile_folders_unique_name;
drop index if exists profile_files_unique_name;
create unique index document_folders_unique_name
  on document_folders (owner_key, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create unique index document_files_unique_name
  on document_files (owner_key, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(file_name));

create index if not exists document_folders_team_member_idx on document_folders (team_member_id);
create index if not exists document_files_team_member_idx   on document_files (team_member_id);
create index if not exists document_activity_team_member_idx on document_activity (team_member_id, created_at desc);

-- 3. HELPERS ──────────────────────────────────────────────────
-- Like profile_in_my_company, for any kind of owner. A company-owned row
-- (both null) passes: its own company_id is already pinned to the caller's
-- by the policies.
create or replace function document_owner_in_my_company(p_profile_id uuid, p_team_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_profile_id is not null then
      exists (select 1 from profiles where id = p_profile_id and company_id = get_my_company_id())
    when p_team_member_id is not null then
      exists (select 1 from team_members where id = p_team_member_id and company_id = get_my_company_id())
    else true
  end;
$$;

-- The folder-cycle guard looked at the old table name.
create or replace function prevent_profile_folder_cycle()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is null or new.parent_id is not distinct from old.parent_id then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'A folder cannot be moved into itself';
  end if;
  if exists (
    with recursive descendants as (
      select id from document_folders where parent_id = new.id
      union all
      select f.id from document_folders f join descendants d on f.parent_id = d.id
    )
    select 1 from descendants where id = new.parent_id
  ) then
    raise exception 'A folder cannot be moved into one of its own sub-folders';
  end if;
  return new;
end;
$$;

-- 4. ROW LEVEL SECURITY ───────────────────────────────────────
-- Read: admins everything in their company; a person only their own.
-- Team-member and company rows have no profile_id, so only admins see them.
create policy "document_folders_select"
  on document_folders for select
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or (profile_id is not null and profile_id = get_my_profile_id()))
  );
create policy "document_folders_admin_write"
  on document_folders for all
  using      (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin' and document_owner_in_my_company(profile_id, team_member_id));

create policy "document_files_select"
  on document_files for select
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or (profile_id is not null and profile_id = get_my_profile_id()))
  );
create policy "document_files_admin_write"
  on document_files for all
  using      (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin' and document_owner_in_my_company(profile_id, team_member_id));

-- Log: append-only, as before. A person may still log only THEIR OWN download.
create policy "document_activity_select"
  on document_activity for select
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or (profile_id is not null and profile_id = get_my_profile_id()))
  );
create policy "document_activity_insert"
  on document_activity for insert
  with check (
    company_id = get_my_company_id()
    and (
      (get_my_role() = 'admin' and document_owner_in_my_company(profile_id, team_member_id))
      or (profile_id is not null and profile_id = get_my_profile_id() and action = 'file_downloaded')
    )
  );

-- (Storage policies need no change: paths are {company}/{owner}/…, where
--  owner is the person's id, the team member's id, or the word "company".
--  Non-admins can only read a path whose 2nd segment is their own profile
--  id, so team-member and company files stay admin-only.)

-- 5. STARTER FOLDERS ──────────────────────────────────────────
-- The profiles trigger kept inserting into the old name; point it at the new.
create or replace function seed_default_profile_folders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    return new;
  end if;
  begin
    insert into document_folders (company_id, profile_id, name)
    select new.company_id, new.id, n
    from unnest(array[
      'Certificates', 'Contracts', 'Driver''s License', 'ID', 'Photos & Videos', 'Proof of Address'
    ]) as n;
  exception when others then
    null;
  end;
  return new;
end;
$$;

-- Team members get the same starter set. One-day casual labourers (typed in
-- on the fly at clock-in) don't — six empty folders each would just be clutter.
create or replace function seed_default_team_member_folders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null or coalesce(new.is_casual, false) then
    return new;
  end if;
  begin
    insert into document_folders (company_id, team_member_id, name)
    select new.company_id, new.id, n
    from unnest(array[
      'Certificates', 'Contracts', 'Driver''s License', 'ID', 'Photos & Videos', 'Proof of Address'
    ]) as n;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_team_members_seed_document_folders on team_members;
create trigger trg_team_members_seed_document_folders
  after insert on team_members
  for each row execute function seed_default_team_member_folders();

create or replace function seed_default_company_folders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into document_folders (company_id, name)
    select new.id, n
    from unnest(array[
      'Certificates', 'Contracts', 'Insurance', 'Licences & Registrations', 'Policies & Procedures', 'Tax & Compliance'
    ]) as n;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_companies_seed_document_folders on companies;
create trigger trg_companies_seed_document_folders
  after insert on companies
  for each row execute function seed_default_company_folders();

-- One-time backfill for what already exists.
insert into document_folders (company_id, team_member_id, name)
select t.company_id, t.id, n
from   team_members t
cross join unnest(array[
  'Certificates', 'Contracts', 'Driver''s License', 'ID', 'Photos & Videos', 'Proof of Address'
]) as n
where  t.company_id is not null
  and  not coalesce(t.is_casual, false)
  and  not exists (select 1 from document_folders f where f.team_member_id = t.id)
on conflict do nothing;

insert into document_folders (company_id, name)
select c.id, n
from   companies c
cross join unnest(array[
  'Certificates', 'Contracts', 'Insurance', 'Licences & Registrations', 'Policies & Procedures', 'Tax & Compliance'
]) as n
where  not exists (
  select 1 from document_folders f
  where  f.company_id = c.id and f.profile_id is null and f.team_member_id is null
)
on conflict do nothing;

commit;
