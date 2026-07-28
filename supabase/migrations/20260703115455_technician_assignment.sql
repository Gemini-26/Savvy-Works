-- ============================================================
-- 009 — Technician assignment: actual clock-in / clock-out
--
-- The planner already supports assigning multiple technicians to a
-- job via appointments -> appointment_assignments, with a shared
-- scheduled_start/scheduled_end per appointment ("appointed to start").
-- This adds a per-technician actual_start / actual_end so each tech's
-- real clock-in/clock-out can be recorded independently (eWorks-style),
-- and is what Jobs/Invoices surface as "time finished".
--
-- Quotes already have a single `assigned_to` (proposed technician,
-- migration 006) — no schema change needed there, only UI.
--
-- SAFE TO RUN: only ALTERs appointment_assignments (adding columns).
--
-- HOW TO RUN: paste into Supabase Dashboard → SQL Editor → Run.
-- ============================================================

alter table appointment_assignments
  add column if not exists actual_start timestamptz,
  add column if not exists actual_end   timestamptz;

-- ──────────────────────────────────────────────────────────────
-- DONE.
-- ──────────────────────────────────────────────────────────────
