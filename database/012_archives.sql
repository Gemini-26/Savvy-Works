-- ──────────────────────────────────────────────────────────────
-- ARCHIVES — generic soft-delete log used app-wide. When a record
-- can't (or shouldn't) be hard-deleted, it's snapshotted here with
-- who deleted it and when, instead of being lost.
-- ──────────────────────────────────────────────────────────────
create table if not exists archived_records (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  entity_type   text not null,
  entity_id     uuid not null,
  entity_label  text,
  data          jsonb not null,
  reason        text,
  archived_by   uuid references profiles(id),
  archived_at   timestamptz not null default now()
);

create index if not exists archived_records_company_id_idx on archived_records (company_id);
create index if not exists archived_records_entity_idx     on archived_records (entity_type, entity_id);

alter table archived_records enable row level security;

drop policy if exists "archived_records_company_isolation" on archived_records;
create policy "archived_records_company_isolation"
  on archived_records for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_archived_records_company_id
  before insert on archived_records
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- Soft-delete markers on jobs — deleting a job that's linked to an
-- invoice can't hard-delete the row (invoices_job_id_fkey blocks
-- it), so jobs are archived in place instead: the row stays (FK
-- stays valid) but is flagged and filtered out of normal listings.
-- ──────────────────────────────────────────────────────────────
alter table jobs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references profiles(id);

create index if not exists jobs_archived_at_idx on jobs (archived_at);

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
