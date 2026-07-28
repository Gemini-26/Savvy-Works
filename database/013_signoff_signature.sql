-- ──────────────────────────────────────────────────────────────
-- SIGN-OFF SIGNATURE — job completion sign-off now captures a
-- drawn signature (base64 PNG data URL) instead of just a typed
-- name, so it can be shown back on its own "Sign-off" tab.
-- ──────────────────────────────────────────────────────────────
alter table jobs
  add column if not exists sign_off_signature text;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
