-- ──────────────────────────────────────────────────────────────
-- JOB DOCUMENTS — generic file attachments for jobs (PDFs, Word
-- docs, spreadsheets, etc.), separate from job_photos which is
-- image-only and tied to the before/after completion gate.
-- Mirrors the job_photos table/bucket/RLS pattern exactly.
-- ──────────────────────────────────────────────────────────────

create table if not exists job_documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete cascade,
  job_id       uuid not null references jobs(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists job_documents_job_id_idx     on job_documents (job_id);
create index if not exists job_documents_company_id_idx on job_documents (company_id);

alter table job_documents enable row level security;

drop policy if exists "job_documents_company_isolation" on job_documents;
create policy "job_documents_company_isolation"
  on job_documents for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_job_documents_company_id
  before insert on job_documents
  for each row execute function set_company_id_on_insert();

-- Storage bucket, same path convention as job-photos:
-- {company_id}/{job_id}/{filename}
insert into storage.buckets (id, name, public)
values ('job-documents', 'job-documents', false)
on conflict (id) do nothing;

drop policy if exists "job_documents_storage_select" on storage.objects;
create policy "job_documents_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'job-documents'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

drop policy if exists "job_documents_storage_insert" on storage.objects;
create policy "job_documents_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'job-documents'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

drop policy if exists "job_documents_storage_delete" on storage.objects;
create policy "job_documents_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'job-documents'
    and (storage.foldername(name))[1] = get_my_company_id()::text
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
