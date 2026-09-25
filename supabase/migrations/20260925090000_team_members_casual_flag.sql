-- ──────────────────────────────────────────────────────────────
-- CASUAL TEAM MEMBERS — one-day labourers added on the fly from the
-- clock-in screen, instead of being pre-registered under Team Members.
-- They're created as inactive so they don't clutter the reusable
-- Active Team Members roster, but is_casual distinguishes them from
-- an ordinary deactivated member in the UI and on-site history stays
-- intact either way (assignment_team_members / team_member logs key
-- off the id, not the active flag).
-- ──────────────────────────────────────────────────────────────

alter table team_members add column if not exists is_casual boolean not null default false;
