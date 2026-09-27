-- Outings recorded with the phone's GPS: the track becomes a route (source "recorded"), marked as completed
-- with the outing's times. Elapsed time includes pauses; moving time only counts time spent moving.
alter type public.route_source add value if not exists 'recorded';

alter table public.route_activity
  add column started_at timestamptz,
  add column duration_s integer check (duration_s >= 0),
  add column moving_s integer check (moving_s >= 0),
  add constraint route_activity_moving_within_duration check (moving_s <= duration_s);
