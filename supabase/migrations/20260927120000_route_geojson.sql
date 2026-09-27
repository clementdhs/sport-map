-- Computed field: `select('route_geojson')` on routes returns the track as a GeoJSON LineString.
-- Runs with the caller's rights, so routes RLS still applies.
create or replace function public.route_geojson(r public.routes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select extensions.st_asgeojson(r.geom, 6)::jsonb;
$$;
