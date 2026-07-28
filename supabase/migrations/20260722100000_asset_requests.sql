-- ──────────────────────────────────────────────────────────────
-- ASSET REQUESTS — PIN-verified peer-to-peer tool borrowing.
-- A technician can request a tool currently held by a colleague;
-- the colleague approves (generating a one-time PIN); both parties
-- meet in person and the borrower enters the PIN to confirm receipt,
-- which is what actually transfers holder_id on `assets`. This is
-- separate from the existing warehouse self-checkout flow, which
-- stays instant (no approval needed — the tool isn't anyone's to
-- withhold).
-- ──────────────────────────────────────────────────────────────

create table if not exists asset_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  asset_id      uuid not null references assets(id) on delete cascade,
  from_id       uuid references profiles(id) on delete set null,  -- current holder being asked
  to_id         uuid not null references profiles(id) on delete cascade, -- requester
  status        text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'completed')),
  pin           text,
  pin_used      boolean not null default false,
  note          text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists asset_requests_asset_id_idx on asset_requests (asset_id);
create index if not exists asset_requests_company_id_idx on asset_requests (company_id);
create index if not exists asset_requests_to_id_idx on asset_requests (to_id);
create index if not exists asset_requests_from_id_idx on asset_requests (from_id);

alter table asset_requests enable row level security;

create or replace trigger trg_asset_requests_company_id
  before insert on asset_requests
  for each row execute function set_company_id_on_insert();

drop policy if exists "asset_requests_select" on asset_requests;
create policy "asset_requests_select"
  on asset_requests for select
  using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or from_id = (select id from profiles where auth_user_id = auth.uid())
      or to_id   = (select id from profiles where auth_user_id = auth.uid())
    )
  );

drop policy if exists "asset_requests_insert" on asset_requests;
create policy "asset_requests_insert"
  on asset_requests for insert
  with check (
    company_id = get_my_company_id()
    and to_id = (select id from profiles where auth_user_id = auth.uid())
  );

-- Only the holder being asked (from_id) may approve/deny; either
-- party may mark it completed once the PIN is confirmed; admins can
-- always intervene.
drop policy if exists "asset_requests_update" on asset_requests;
create policy "asset_requests_update"
  on asset_requests for update
  using (
    company_id = get_my_company_id()
    and (
      get_my_role() = 'admin'
      or from_id = (select id from profiles where auth_user_id = auth.uid())
      or to_id   = (select id from profiles where auth_user_id = auth.uid())
    )
  )
  with check (company_id = get_my_company_id());

-- Technicians confirming a PIN handover need to move holder_id to
-- themselves on a tool they don't yet hold — extend the existing
-- self-checkout policy to also allow "I'm the to_id on an approved
-- request for this asset".
drop policy if exists "assets_technician_checkout" on assets;
create policy "assets_technician_checkout"
  on assets for update
  using (
    company_id = get_my_company_id()
    and get_my_role() = 'technician'
    and (
      holder_id = (select id from profiles where auth_user_id = auth.uid())
      or status = 'warehouse'
      or exists (
        select 1 from asset_requests r
        where r.asset_id = assets.id
          and r.status = 'approved'
          and r.to_id = (select id from profiles where auth_user_id = auth.uid())
      )
      -- a former lender may still recall (set due_back on) a tool they
      -- last handed off, even though they're no longer the holder
      or exists (
        select 1 from asset_requests r
        where r.asset_id = assets.id
          and r.status = 'completed'
          and r.from_id = (select id from profiles where auth_user_id = auth.uid())
      )
    )
  )
  with check (company_id = get_my_company_id());

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
