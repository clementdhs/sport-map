-- What OpenRouteService knows of the ways along the track (#43): surface, way type and trail difficulty, as
-- ranges of point indices in geom. Filled for the parts snapped to paths in the editor; null for routes saved
-- before this column existed, imported from GPX or recorded with the GPS, which then show nothing.
alter table public.routes add column way_info jsonb
  check (way_info is null or jsonb_typeof(way_info) = 'object');
