-- ──────────────────────────────────────────────────────────────
-- PROFILE DOCUMENTS — a per-person "My Documents" file explorer
-- (Driver's License, ID, certificates, photos, videos …).
--
-- These are identity documents, so unlike most tables here this one
-- is NOT open to the whole company:
--   • admins can read and write everything in their company
--   • a person can read (never change) their own folders and files
--   • nobody else can see them
-- Enforced in RLS and on the storage bucket, not just in the UI.
--
-- Three tables + one private bucket:
--   profile_folders            nested folders per person
--   profile_files              file rows (bytes live in storage)
--   profile_document_activity  append-only audit log (like job_activity)
-- ──────────────────────────────────────────────────────────────

-- The signed-in user's own profile id (RLS helper, mirrors get_my_role()).
create or replace function get_my_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from   profiles
  where  auth_user_id = auth.uid()
  limit  1;
$$;

-- True when the profile belongs to the caller's company. The write
-- policies below use it so an admin can never attach folders, files or
-- log lines to a person in ANOTHER company (the tables' company_id alone
-- doesn't prove that — profile_id is a separate column).
create or replace function profile_in_my_company(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from   profiles
    where  id = p_profile_id
      and  company_id = get_my_company_id()
  );
$$;

-- ──────────────────────────────────────────────────────────────
-- 1. FOLDERS
-- ──────────────────────────────────────────────────────────────
create table if not exists profile_folders (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  parent_id   uuid,
  name        text not null check (length(btrim(name)) between 1 and 255),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- lets child rows prove they sit under a folder of the SAME person
  constraint profile_folders_id_profile_key unique (id, profile_id),
  constraint profile_folders_parent_fkey
    foreign key (parent_id, profile_id)
    references profile_folders (id, profile_id) on delete cascade
);

create index if not exists profile_folders_profile_id_idx on profile_folders (profile_id);
create index if not exists profile_folders_company_id_idx on profile_folders (company_id);

-- No two folders with the same name side by side (Windows rule).
create unique index if not exists profile_folders_unique_name
  on profile_folders (profile_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ──────────────────────────────────────────────────────────────
-- 2. FILES
-- ──────────────────────────────────────────────────────────────
create table if not exists profile_files (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  folder_id    uuid,
  storage_path text not null,
  file_name    text not null check (length(btrim(file_name)) between 1 and 255),
  file_size    bigint,
  mime_type    text,
  uploaded_by  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profile_files_folder_fkey
    foreign key (folder_id, profile_id)
    references profile_folders (id, profile_id) on delete cascade,
  constraint profile_files_uploaded_by_fkey
    foreign key (uploaded_by) references profiles(id) on delete set null
);

create index if not exists profile_files_profile_id_idx on profile_files (profile_id);
create index if not exists profile_files_folder_id_idx  on profile_files (folder_id);
create index if not exists profile_files_company_id_idx on profile_files (company_id);

create unique index if not exists profile_files_unique_name
  on profile_files (profile_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(file_name));

-- ──────────────────────────────────────────────────────────────
-- 3. ACTIVITY LOG — append-only (no update/delete policy at all)
-- ──────────────────────────────────────────────────────────────
create table if not exists profile_document_activity (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text,
  action      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists profile_document_activity_profile_idx
  on profile_document_activity (profile_id, created_at desc);
create index if not exists profile_document_activity_company_idx
  on profile_document_activity (company_id);

-- ──────────────────────────────────────────────────────────────
-- 4. TRIGGERS
-- ──────────────────────────────────────────────────────────────
create or replace trigger trg_profile_folders_company_id
  before insert on profile_folders
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_profile_files_company_id
  before insert on profile_files
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_profile_document_activity_company_id
  before insert on profile_document_activity
  for each row execute function set_company_id_on_insert();

create or replace function touch_profile_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger trg_profile_folders_touch
  before update on profile_folders
  for each row execute function touch_profile_documents_updated_at();

create or replace trigger trg_profile_files_touch
  before update on profile_files
  for each row execute function touch_profile_documents_updated_at();

-- "Added by" must be the real uploader, not whatever the browser sent.
create or replace function stamp_profile_folder_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := get_my_profile_id();
  return new;
end;
$$;

create or replace trigger trg_profile_folders_stamp
  before insert on profile_folders
  for each row execute function stamp_profile_folder_creator();

create or replace function stamp_profile_file_uploader()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.uploaded_by := get_my_profile_id();
  return new;
end;
$$;

create or replace trigger trg_profile_files_stamp
  before insert on profile_files
  for each row execute function stamp_profile_file_uploader();

-- The log must say who REALLY did it, so the actor is stamped from the
-- session here and whatever the browser sent is ignored.
create or replace function stamp_profile_document_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text;
begin
  select id, full_name into v_id, v_name
  from   profiles
  where  auth_user_id = auth.uid()
  limit  1;

  new.actor_id   := v_id;
  new.actor_name := coalesce(v_name, 'System');
  return new;
end;
$$;

create or replace trigger trg_profile_document_activity_stamp
  before insert on profile_document_activity
  for each row execute function stamp_profile_document_activity();

-- A folder can't be moved into itself or into one of its own sub-folders.
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
      select id from profile_folders where parent_id = new.id
      union all
      select f.id from profile_folders f join descendants d on f.parent_id = d.id
    )
    select 1 from descendants where id = new.parent_id
  ) then
    raise exception 'A folder cannot be moved into one of its own sub-folders';
  end if;
  return new;
end;
$$;

create or replace trigger trg_profile_folders_no_cycle
  before update on profile_folders
  for each row execute function prevent_profile_folder_cycle();

-- ──────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
alter table profile_folders           enable row level security;
alter table profile_files             enable row level security;
alter table profile_document_activity enable row level security;

-- Folders
drop policy if exists "profile_folders_select" on profile_folders;
create policy "profile_folders_select"
  on profile_folders for select
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or profile_id = get_my_profile_id())
  );

drop policy if exists "profile_folders_admin_write" on profile_folders;
create policy "profile_folders_admin_write"
  on profile_folders for all
  using      (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin' and profile_in_my_company(profile_id));

-- Files
drop policy if exists "profile_files_select" on profile_files;
create policy "profile_files_select"
  on profile_files for select
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or profile_id = get_my_profile_id())
  );

drop policy if exists "profile_files_admin_write" on profile_files;
create policy "profile_files_admin_write"
  on profile_files for all
  using      (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin' and profile_in_my_company(profile_id));

-- Activity: read by admins and by the person it is about. Insert only —
-- admins log anything; a person can only log that THEY downloaded THEIR
-- own file. No update or delete policy exists, so entries are permanent.
drop policy if exists "profile_document_activity_select" on profile_document_activity;
create policy "profile_document_activity_select"
  on profile_document_activity for select
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or profile_id = get_my_profile_id())
  );

drop policy if exists "profile_document_activity_insert" on profile_document_activity;
create policy "profile_document_activity_insert"
  on profile_document_activity for insert
  with check (
    company_id = get_my_company_id()
    and (
      (get_my_role() = 'admin' and profile_in_my_company(profile_id))
      or (profile_id = get_my_profile_id() and action = 'file_downloaded')
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 6. STORAGE BUCKET — private. Path: {company_id}/{profile_id}/{file}
-- ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('profile-documents', 'profile-documents', false)
on conflict (id) do nothing;

drop policy if exists "profile_documents_storage_select" on storage.objects;
create policy "profile_documents_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'profile-documents'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and (
      get_my_role() = 'admin'
      or (storage.foldername(name))[2] = get_my_profile_id()::text
    )
  );

drop policy if exists "profile_documents_storage_insert" on storage.objects;
create policy "profile_documents_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-documents'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and get_my_role() = 'admin'
  );

drop policy if exists "profile_documents_storage_delete" on storage.objects;
create policy "profile_documents_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'profile-documents'
    and (storage.foldername(name))[1] = get_my_company_id()::text
    and get_my_role() = 'admin'
  );

-- ──────────────────────────────────────────────────────────────
-- 7. STARTER FOLDERS — every new person gets the usual ones; admins
--    can rename, delete or add more. Wrapped so a problem here can
--    never stop a user from being created.
-- ──────────────────────────────────────────────────────────────
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
    insert into profile_folders (company_id, profile_id, name)
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

drop trigger if exists trg_profiles_seed_document_folders on profiles;
create trigger trg_profiles_seed_document_folders
  after insert on profiles
  for each row execute function seed_default_profile_folders();

-- One-time backfill for people who already exist.
insert into profile_folders (company_id, profile_id, name)
select p.company_id, p.id, n
from   profiles p
cross join unnest(array[
  'Certificates', 'Contracts', 'Driver''s License', 'ID', 'Photos & Videos', 'Proof of Address'
]) as n
where  p.company_id is not null
  and  not exists (select 1 from profile_folders f where f.profile_id = p.id)
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
