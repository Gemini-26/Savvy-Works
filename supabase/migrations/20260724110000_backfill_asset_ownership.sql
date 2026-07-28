-- ──────────────────────────────────────────────────────────────
-- BACKFILL: restore ownership on legacy tool assignments.
--
-- Before the storeroom-request/PIN flow existed, admins assigned
-- tools to technicians directly (assignAsset) without ever setting
-- `owner_id` — only `holder_id`. That made every one of those tools
-- indistinguishable from a genuine storeroom-pool tool (owner_id
-- null), so the Storeroom tab started listing a technician's own
-- permanent toolkit as if it belonged to the storeroom.
--
-- Fix: any tool currently held by someone, with no owner, that was
-- never actually borrowed from the storeroom via a completed
-- `borrow_storeroom` request, is a personal tool — restore
-- ownership to its current holder and mark it `with_owner` (the
-- resting state for a technician's own gear, as opposed to
-- `checked_out`, which now means "out on loan to someone who isn't
-- the owner").
-- ──────────────────────────────────────────────────────────────

update assets
set owner_id = holder_id,
    status = 'with_owner'
where asset_group = 'tool_inventory'
  and holder_id is not null
  and owner_id is null
  and not exists (
    select 1 from asset_requests r
    where r.asset_id = assets.id
      and r.type = 'borrow_storeroom'
      and r.status = 'completed'
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
