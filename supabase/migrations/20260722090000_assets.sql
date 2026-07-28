-- ──────────────────────────────────────────────────────────────
-- ASSETS (tool tracking) — the "Items > Assets" admin section and
-- the technician "My Tools" tab share this schema. An asset is a
-- physical tool/piece of equipment owned by the company or a
-- technician, currently held by whoever last checked it out.
-- ──────────────────────────────────────────────────────────────

create table if not exists asset_categories (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);

create table if not exists assets (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  name          text not null,
  category_id   uuid references asset_categories(id) on delete set null,
  barcode       text,
  serial_number text,
  value         numeric(12,2) not null default 0,
  condition     text not null default 'Good' check (condition in ('Good', 'Fair', 'Damaged')),
  -- warehouse: with the company, unassigned. with_owner: with its registered owner.
  -- checked_out: a technician has it out against the warehouse. repair: out of service.
  status        text not null default 'warehouse' check (status in ('warehouse', 'with_owner', 'checked_out', 'repair')),
  owner_id      uuid references profiles(id) on delete set null,
  holder_id     uuid references profiles(id) on delete set null,
  since         timestamptz,
  due_back      date,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists assets_company_id_idx  on assets (company_id);
create index if not exists assets_holder_id_idx    on assets (holder_id);
create index if not exists assets_category_id_idx  on assets (category_id);

-- One row per checkout/return — the audit trail admins rely on to
-- see who had a tool, in what condition, and when it changed hands.
create table if not exists asset_checkout_log (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  asset_id       uuid not null references assets(id) on delete cascade,
  action         text not null check (action in ('checked_out', 'returned')),
  from_id        uuid references profiles(id) on delete set null,
  to_id          uuid references profiles(id) on delete set null,
  condition_out  text,
  comment_out    text,
  condition_in   text,
  comment_in     text,
  created_at     timestamptz not null default now()
);

create index if not exists asset_checkout_log_asset_id_idx on asset_checkout_log (asset_id);
create index if not exists asset_checkout_log_company_id_idx on asset_checkout_log (company_id);

alter table asset_categories   enable row level security;
alter table assets             enable row level security;
alter table asset_checkout_log enable row level security;

create or replace trigger trg_asset_categories_company_id
  before insert on asset_categories
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_assets_company_id
  before insert on assets
  for each row execute function set_company_id_on_insert();

create or replace trigger trg_asset_checkout_log_company_id
  before insert on asset_checkout_log
  for each row execute function set_company_id_on_insert();

-- Everyone in the company can see the catalogue and log (technicians
-- need to see tools they could request); only admins may write to
-- categories/assets directly. Technicians may update an asset row
-- only for their own checkout/return (enforced in the app layer via
-- checkoutAsset/returnAsset, which always set holder_id = their own
-- profile id) and may always insert their own checkout log rows.

drop policy if exists "asset_categories_select" on asset_categories;
create policy "asset_categories_select"
  on asset_categories for select
  using (company_id = get_my_company_id());

drop policy if exists "asset_categories_write" on asset_categories;
create policy "asset_categories_write"
  on asset_categories for all
  using (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin');

drop policy if exists "assets_select" on assets;
create policy "assets_select"
  on assets for select
  using (company_id = get_my_company_id());

drop policy if exists "assets_admin_write" on assets;
create policy "assets_admin_write"
  on assets for all
  using (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin');

-- Technicians can check an available tool out to themselves, or
-- check one they're currently holding back in.
drop policy if exists "assets_technician_checkout" on assets;
create policy "assets_technician_checkout"
  on assets for update
  using (
    company_id = get_my_company_id()
    and get_my_role() = 'technician'
    and (
      holder_id = (select id from profiles where auth_user_id = auth.uid())
      or status = 'warehouse'
    )
  )
  with check (company_id = get_my_company_id());

drop policy if exists "asset_checkout_log_select" on asset_checkout_log;
create policy "asset_checkout_log_select"
  on asset_checkout_log for select
  using (company_id = get_my_company_id());

drop policy if exists "asset_checkout_log_insert" on asset_checkout_log;
create policy "asset_checkout_log_insert"
  on asset_checkout_log for insert
  with check (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or from_id = (select id from profiles where auth_user_id = auth.uid())
      or to_id   = (select id from profiles where auth_user_id = auth.uid())
    )
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
