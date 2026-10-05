-- The GPS points of an outing with their times (#57), so that its splits per kilometre and its speed along the
-- way can be shown: [lng, lat, GPS altitude or null, seconds since the start, seconds spent moving so far] each.
-- Null for outings recorded before, which keep their times only.
alter table public.route_outings
  add column track jsonb
    constraint route_outings_track_points check (
      track is null
      or case when jsonb_typeof(track) = 'array' then jsonb_array_length(track) between 2 and 10000 else false end
    ),
  -- Lists of outings tell which ones have a detail without loading every track.
  add column has_track boolean generated always as (track is not null) stored;
