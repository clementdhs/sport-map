-- Overpass answers kept for the loop panel (#311): the peaks and water points around a start (#214) and the places
-- of a name (#293, #310), per cell of a 0.02° grid (shared/utils/loopPlacesCache.ts). Public OpenStreetMap data
-- (ODbL, attribution shown by the app), shared by the family: a usual start no longer depends on Overpass, often
-- busy or down. The app asks again once an answer is 30 days old, and keeps using an older one while Overpass fails.

create table public.loop_place_searches (
  -- Kind of search (peak, water, or named + language + the name's core) and the cell: see loopPlacesCacheKey.
  key text primary key check (char_length(key) between 1 and 300),
  -- OsmPlace[] for peaks and water points, NamedPlace[] for a name, checked by the API.
  places jsonb not null check (jsonb_typeof(places) = 'array'),
  fetched_at timestamptz not null default now()
);

alter table public.loop_place_searches enable row level security;

-- Read by any member. No write policy: only the server writes it, with the service role, after checking the places.
create policy "loop_place_searches: readable by the family"
  on public.loop_place_searches for select
  to authenticated
  using (true);

-- Two-factor authentication (#253).
create policy "Two-factor members need a code" on public.loop_place_searches
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
