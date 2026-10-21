-- Useful places along a route (#52): drinking water, huts and shelters, parkings, toilets and peaks found in
-- OpenStreetMap near the track. The browser asks Overpass once, then any member who can see the route saves the
-- answer here, so the route page and follow mode (offline included) show them without asking again. It is map
-- data, not the owner's content: any member who sees the route may refresh it.

create table public.route_osm_places (
  route_id uuid primary key references public.routes (id) on delete cascade,
  -- [{ id, type, coordinates, name?, ele? }], checked by the API (osmPlacesPayloadSchema); the length is capped here
  -- too (MAX_OSM_PLACES), as members could write through PostgREST directly.
  places jsonb not null check (jsonb_typeof(places) = 'array' and jsonb_array_length(places) <= 300),
  searched_at timestamptz not null default now()
);

alter table public.route_osm_places enable row level security;

-- The routes policy applies inside the subqueries: only routes the member can see.
create policy "route_osm_places: readable with the route"
  on public.route_osm_places for select
  to authenticated
  using (exists (select 1 from public.routes r where r.id = route_osm_places.route_id));

create policy "route_osm_places: saved by members who see the route"
  on public.route_osm_places for insert
  to authenticated
  with check (exists (select 1 from public.routes r where r.id = route_osm_places.route_id));

create policy "route_osm_places: refreshed by members who see the route"
  on public.route_osm_places for update
  to authenticated
  using (exists (select 1 from public.routes r where r.id = route_osm_places.route_id))
  with check (exists (select 1 from public.routes r where r.id = route_osm_places.route_id));

-- A new track makes the places stale: they go, and the next visit of the route page searches again. Security
-- definer: members have no delete policy, and the route's owner must clear what another member saved.
create function public.clear_route_osm_places()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.route_osm_places where route_id = new.id;
  return new;
end;
$$;

revoke execute on function public.clear_route_osm_places() from public, anon, authenticated;

create trigger routes_clear_osm_places
  after update of geom on public.routes
  for each row
  -- Compared as EWKB text: exact, whatever geography's own equality operator compares.
  when (old.geom::text is distinct from new.geom::text)
  execute function public.clear_route_osm_places();
