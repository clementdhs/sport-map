-- How the track was built in the editor (waypoints, and each segment's mode and range in geom), so a saved
-- route can be edited again. Null for routes saved before this column existed.
alter table public.routes add column editor_state jsonb;
