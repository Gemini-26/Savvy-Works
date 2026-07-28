# Deprecated — do not add new files here

This folder was the original hand-run migration history (paste-into-Supabase-SQL-editor
style). It fell out of sync with `supabase/migrations/` — 7 later migrations (assets,
password-change requests, login events) were only ever added to `supabase/migrations/`
and never mirrored back here.

As of 2026-07-28, all files in this folder have been copied into `supabase/migrations/`
with timestamps derived from each file's original modification date, so the two
directories no longer disagree. **`supabase/migrations/` is now the single source of
truth** — it uses the standard Supabase CLI naming convention (`<timestamp>_<name>.sql`)
and every migration, old and new, lives there in one chronological sequence.

The `.sql` files in this folder are kept only for historical reference. Do not edit them
and do not add new migrations here — add new migrations to `supabase/migrations/` instead.
