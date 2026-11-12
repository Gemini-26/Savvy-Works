-- ──────────────────────────────────────────────────────────────
-- SCHEDULE THE 17:00 CLOCK-OUT — runs auto_clock_out_everyone()
-- (previous migration) once a day.
--
-- pg_cron keeps time in UTC. South Africa is UTC+2 all year (no
-- daylight saving), so 17:00 there is always 15:00 UTC. If the
-- company ever moves to a zone with daylight saving, this line must
-- change with the clocks.
--
-- pg_net is what lets the database call the send-push function so
-- the alert reaches phones and browsers that have the app closed.
--
-- Re-running this just replaces the job of the same name.
-- To stop the daily clock-out:  select cron.unschedule('auto-clock-out');
-- ──────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'auto-clock-out',
  '0 15 * * *',
  $$select public.auto_clock_out_everyone()$$
);

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
