-- Points of interest placed on the track: [{ type, coordinates: [lng, lat], note? }], validated by the API.
-- Stored with the route, so they follow its visibility (RLS) and are saved in the same request.
alter table public.routes add column pois jsonb not null default '[]'::jsonb
  constraint routes_pois_is_array check (jsonb_typeof(pois) = 'array');
