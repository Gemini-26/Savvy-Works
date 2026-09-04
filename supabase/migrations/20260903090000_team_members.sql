-- ──────────────────────────────────────────────────────────────
-- TEAM MEMBERS — labourers/helpers technicians bring on site.
-- They are not app users (no login, no profiles row) and are not
-- fixed to a single technician — admin registers them once, and
-- any technician can select whichever ones are with them when
-- they clock in for a job.
-- ──────────────────────────────────────────────────────────────

create table if not exists team_members (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  full_name  text not null,
  phone      text,
  role_title text,
  is_active  boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists team_members_company_id_idx on team_members (company_id);

alter table team_members enable row level security;

drop policy if exists "team_members_company_isolation" on team_members;
create policy "team_members_company_isolation"
  on team_members for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_team_members_company_id
  before insert on team_members
  for each row execute function set_company_id_on_insert();

-- Which team members a technician brought along for a specific
-- on-site clock-in (one appointment_assignments row = one clock-in).
create table if not exists assignment_team_members (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  assignment_id uuid not null references appointment_assignments(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (assignment_id, team_member_id)
);

create index if not exists assignment_team_members_assignment_id_idx on assignment_team_members (assignment_id);
create index if not exists assignment_team_members_company_id_idx    on assignment_team_members (company_id);

alter table assignment_team_members enable row level security;

drop policy if exists "assignment_team_members_company_isolation" on assignment_team_members;
create policy "assignment_team_members_company_isolation"
  on assignment_team_members for all
  using  (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

create or replace trigger trg_assignment_team_members_company_id
  before insert on assignment_team_members
  for each row execute function set_company_id_on_insert();

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
