-- ============================================================
-- 007 — Phase 4: Job completion flow
--
-- Adds sign-off/completion fields to `jobs`, a `job_photos` table
-- for proof-of-work attachments, and a private Supabase Storage
-- bucket ("job-photos") with RLS scoped to the uploader's company.
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. JOBS — completion / sign-off fields
-- ──────────────────────────────────────────────────────────────
alter table jobs
  add column if not exists completion_notes text,
  add column if not exists materials_used   text,
  add column if not exists sign_off_name    text,
  add column if not exists completed_at     timestamptz;

-- ──────────────────────────────────────────────────────────────
-- 2. JOB_PHOTOS — attachment metadata (file itself lives in Storage)
-- ──────────────────────────────────────────────────────────────
create table if not exists job_photos (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete cascade,
  job_id       uuid not null references jobs(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists job_photos_job_id_idx     on job_photos (job_id);
create index if not exists job_photos_company_id_idx on job_photos (company_id);

alter table job_photos enable row level security;

drop policy if exists "job_photos_company_isolation" on job_photos;
create policy "job_photos_company_isolation"
  on job_photos for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_job_photos_company_id
  before insert on job_photos
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- 3. STORAGE — private bucket, path convention:
--    {company_id}/{job_id}/{filename}
--    RLS checks the first path segment against the caller's company.
-- ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

drop policy if exists "job_photos_storage_select" on storage.objects;
create policy "job_photos_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

drop policy if exists "job_photos_storage_insert" on storage.objects;
create policy "job_photos_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

drop policy if exists "job_photos_storage_delete" on storage.objects;
create policy "job_photos_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
