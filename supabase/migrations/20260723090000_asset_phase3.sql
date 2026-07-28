-- ──────────────────────────────────────────────────────────────
-- ASSETS PHASE 3
--   1. assets: split into Vehicles vs Tools & Inventory, and tools
--      vs consumable inventory within that.
--   2. asset_requests: add `type` (borrow_peer / borrow_storeroom /
--      recall) and `return_to_storeroom` so the same PIN-verified
--      request/approve/confirm machinery covers storeroom checkout
--      requests and PIN-verified recalls (admin- or peer-initiated),
--      not just peer-to-peer borrowing.
--   3. Technicians can no longer self-checkout a storeroom tool by
--      flipping its status directly — every storeroom pickup now
--      goes through an approved + PIN-confirmed request.
--   4. asset_lists / asset_list_items: named, reusable bundles of
--      tools or inventory an admin can build, duplicate, edit and
--      assign to a technician.
-- ──────────────────────────────────────────────────────────────

alter table assets add column if not exists asset_group text not null default 'tool_inventory' check (asset_group in ('vehicle', 'tool_inventory'));
alter table assets add column if not exists item_kind    text not null default 'tool'          check (item_kind in ('tool', 'inventory'));

alter table asset_requests add column if not exists type               text not null default 'borrow_peer' check (type in ('borrow_peer', 'borrow_storeroom', 'recall'));
alter table asset_requests add column if not exists return_to_storeroom boolean not null default false;

-- Requesters can create a peer borrow (to_id = me, from_id = current
-- holder), a storeroom request (to_id = me, from_id null until an
-- admin approves it), or a recall (from_id = me, to_id = current
-- holder — the direction is reversed: the *holder* will be the one
-- generating the PIN when they're ready to hand the tool back).
drop policy if exists "asset_requests_insert" on asset_requests;
create policy "asset_requests_insert"
  on asset_requests for insert
  with check (
    company_id = get_my_company_id()
    and (
      (type = 'borrow_peer'      and to_id = (select id from profiles where auth_user_id = auth.uid()))
      or (type = 'borrow_storeroom' and to_id = (select id from profiles where auth_user_id = auth.uid()) and from_id is null)
      or (type = 'recall'           and from_id = (select id from profiles where auth_user_id = auth.uid()))
    )
  );

-- Technicians may no longer flip a storeroom tool to themselves —
-- only: return a tool they currently hold, receive a tool via an
-- approved request PIN'd to them, or receive a tool back via a
-- completed/approved recall they initiated.
drop policy if exists "assets_technician_checkout" on assets;
create policy "assets_technician_checkout"
  on assets for update
  using (
    company_id = get_my_company_id()
    and get_my_role() = 'technician'
    and (
      holder_id = (select id from profiles where auth_user_id = auth.uid())
      or exists (
        select 1 from asset_requests r
        where r.asset_id = assets.id
          and r.status = 'approved'
          and r.type in ('borrow_peer', 'borrow_storeroom')
          and r.to_id = (select id from profiles where auth_user_id = auth.uid())
      )
      or exists (
        select 1 from asset_requests r
        where r.asset_id = assets.id
          and r.status = 'approved'
          and r.type = 'recall'
          and r.from_id = (select id from profiles where auth_user_id = auth.uid())
      )
      -- a former lender/recaller may still recall a tool they last
      -- confirmed receipt of, even though they're no longer holder
      or exists (
        select 1 from asset_requests r
        where r.asset_id = assets.id
          and r.status = 'completed'
          and r.from_id = (select id from profiles where auth_user_id = auth.uid())
      )
    )
  )
  with check (company_id = get_my_company_id());

create table if not exists asset_lists (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  name          text not null,
  list_type     text not null check (list_type in ('tools', 'inventory')),
  assigned_to   uuid references profiles(id) on delete set null,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists asset_list_items (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references asset_lists(id) on delete cascade,
  asset_id      uuid not null references assets(id) on delete cascade,
  quantity      integer not null default 1,
  created_at    timestamptz not null default now()
);

create index if not exists asset_list_items_list_id_idx on asset_list_items (list_id);
create index if not exists asset_lists_company_id_idx on asset_lists (company_id);
create index if not exists asset_lists_assigned_to_idx on asset_lists (assigned_to);

alter table asset_lists      enable row level security;
alter table asset_list_items enable row level security;

create or replace trigger trg_asset_lists_company_id
  before insert on asset_lists
  for each row execute function set_company_id_on_insert();

-- Admins manage lists; a technician can see lists assigned to them.
drop policy if exists "asset_lists_select" on asset_lists;
create policy "asset_lists_select"
  on asset_lists for select
  using (
    company_id = get_my_company_id()
    and (get_my_role() = 'admin' or assigned_to = (select id from profiles where auth_user_id = auth.uid()))
  );

drop policy if exists "asset_lists_write" on asset_lists;
create policy "asset_lists_write"
  on asset_lists for all
  using (company_id = get_my_company_id() and get_my_role() = 'admin')
  with check (company_id = get_my_company_id() and get_my_role() = 'admin');

drop policy if exists "asset_list_items_select" on asset_list_items;
create policy "asset_list_items_select"
  on asset_list_items for select
  using (
    exists (
      select 1 from asset_lists l
      where l.id = asset_list_items.list_id
        and l.company_id = get_my_company_id()
        and (get_my_role() = 'admin' or l.assigned_to = (select id from profiles where auth_user_id = auth.uid()))
    )
  );

drop policy if exists "asset_list_items_write" on asset_list_items;
create policy "asset_list_items_write"
  on asset_list_items for all
  using (
    exists (select 1 from asset_lists l where l.id = asset_list_items.list_id and l.company_id = get_my_company_id())
    and get_my_role() = 'admin'
  )
  with check (
    exists (select 1 from asset_lists l where l.id = asset_list_items.list_id and l.company_id = get_my_company_id())
    and get_my_role() = 'admin'
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
