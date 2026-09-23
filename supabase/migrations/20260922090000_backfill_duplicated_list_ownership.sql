-- ──────────────────────────────────────────────────────────────
-- BACKFILL: ownership on assets created by list duplication.
--
-- `duplicateAssetList` clones every item of a list into a brand-new
-- asset row for the receiving technician, but it only ever set
-- `holder_id` — never `owner_id`. An owner-less tool is, by this
-- module's convention, storeroom stock (admin lists show it as
-- "Owner: Office"), so a technician's entire duplicated toolkit
-- landed in the Storeroom Tools tab of their portal instead of
-- splitting across My Tools / My Inventory, and only a genuinely
-- office-owned tool should be sitting there.
--
-- Clones are identifiable by the checkout-log entry the duplication
-- writes for them; nothing else stamps that comment. Anything a
-- technician actually borrowed from the storeroom (assigned by an
-- admin, or requested via a completed `borrow_storeroom` request)
-- is deliberately left owner-less.
-- ──────────────────────────────────────────────────────────────

update assets
set owner_id = holder_id,
    status = 'with_owner'
where asset_group = 'tool_inventory'
  and holder_id is not null
  and owner_id is null
  and exists (
    select 1 from asset_checkout_log l
    where l.asset_id = assets.id
      and l.action = 'checked_out'
      and l.comment_out like 'Cloned from %list duplication'
  )
  and not exists (
    select 1 from asset_requests r
    where r.asset_id = assets.id
      and r.type = 'borrow_storeroom'
      and r.status = 'completed'
  );

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
