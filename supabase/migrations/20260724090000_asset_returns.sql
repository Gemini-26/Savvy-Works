-- ──────────────────────────────────────────────────────────────
-- ASSET RETURNS — technician-initiated, admin/colleague-approved,
-- PIN-verified returns. Distinct from `recall` (which is initiated
-- by the party wanting the tool back): here the current holder
-- initiates, the receiving party (admin for storeroom, colleague for
-- peer) approves and generates a PIN, the PIN is shown to the
-- returning technician, and the receiving party enters it in person
-- to confirm the tool actually changed hands.
-- ──────────────────────────────────────────────────────────────

alter table asset_requests alter column to_id drop not null;

alter table asset_requests drop constraint if exists asset_requests_type_check;
alter table asset_requests add constraint asset_requests_type_check
  check (type in ('borrow_peer', 'borrow_storeroom', 'recall', 'return'));

-- Returns: from_id = the technician returning the tool (known at
-- creation), to_id = the receiving party — the colleague's id for a
-- peer return (known up front), or null for a storeroom return until
-- an admin approves and claims it.
drop policy if exists "asset_requests_insert" on asset_requests;
create policy "asset_requests_insert"
  on asset_requests for insert
  with check (
    company_id = get_my_company_id()
    and (
      (type = 'borrow_peer'      and to_id = (select id from profiles where auth_user_id = auth.uid()))
      or (type = 'borrow_storeroom' and to_id = (select id from profiles where auth_user_id = auth.uid()) and from_id is null)
      or (type = 'recall'           and from_id = (select id from profiles where auth_user_id = auth.uid()))
      or (type = 'return'           and from_id = (select id from profiles where auth_user_id = auth.uid()))
    )
  );

-- A colleague confirming receipt of a peer return needs to move
-- holder_id to themselves — same shape as the existing "approved
-- borrow" grant, just also covering `return` requests where they're
-- the to_id.
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
          and r.type in ('borrow_peer', 'borrow_storeroom', 'return')
          and r.to_id = (select id from profiles where auth_user_id = auth.uid())
      )
      or exists (
        select 1 from asset_requests r
        where r.asset_id = assets.id
          and r.status = 'approved'
          and r.type = 'recall'
          and r.from_id = (select id from profiles where auth_user_id = auth.uid())
      )
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
