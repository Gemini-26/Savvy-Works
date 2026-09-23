-- ──────────────────────────────────────────────────────────────
-- CLEANUP: deleted assets still sitting on technicians' lists.
--
-- Assets are soft-deleted (`active = false`) so their checkout
-- history survives, but `deleteAsset` never removed the
-- `asset_list_items` rows pointing at them. The result: a tool
-- nobody holds, and that no admin screen offers a way to remove,
-- keeps counting towards the technician's liability forever —
-- which is why the admin panel's total ran ahead of the figure
-- the technician sees in their own portal.
--
-- `deleteAsset` now clears these rows itself, and both the panel
-- and the liability totals skip deactivated assets, so the app is
-- correct with or without this cleanup. This drops the rows left
-- behind before that fix so the data matches what's displayed.
-- ──────────────────────────────────────────────────────────────

delete from asset_list_items
where asset_id in (select id from assets where active = false);

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
