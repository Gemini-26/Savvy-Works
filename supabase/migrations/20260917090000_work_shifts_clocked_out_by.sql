-- Tracks who actually ended a shift — the technician themselves, or an
-- admin force-clocking them out from Live Users — so shift history/reports
-- can show it wasn't a self clock-out.
alter table work_shifts
  add column if not exists clocked_out_by uuid references profiles(id);
