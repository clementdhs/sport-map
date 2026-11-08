-- Privacy zones (#254): circles around a member's home or work. Routes and recorded outings starting or ending in
-- one are shown to the rest of the team without their part inside it (shared/utils/privacyZones.ts).
--
-- The routes row and route_outings.track hold what the TEAM sees, so every policy, list, search, computed field and
-- the link preview (service role) only ever read the masked track. The full data of a masked route or outing is
-- kept apart in route_originals / outing_originals, readable by its owner only, and the API puts it back for them.

-- Zones -------------------------------------------------------------------------------------------------------------

create table public.privacy_zones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  label text check (label is null or char_length(label) <= 60),
  -- The place as picked, shown in the owner's settings.
  lng double precision not null check (lng between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  -- The centre of the circle that cuts tracks: moved at random from the place, once, so that crossing several
  -- routes' cut points doesn't lead to it.
  mask_lng double precision not null check (mask_lng between -180 and 180),
  mask_lat double precision not null check (mask_lat between -90 and 90),
  radius_m integer not null check (radius_m in (200, 500, 1000)),
  created_at timestamptz not null default now()
);

create index privacy_zones_owner_idx on public.privacy_zones (owner_id, created_at);

alter table public.privacy_zones enable row level security;

-- No update: a zone is removed and added again, which recomputes the masks.
create policy "privacy_zones: readable by their owner"
  on public.privacy_zones for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "privacy_zones: added by their owner"
  on public.privacy_zones for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "privacy_zones: removed by their owner"
  on public.privacy_zones for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- What the team sees of a route -------------------------------------------------------------------------------------

alter table public.routes
  -- Its start or end is cut by one of the owner's zones: the row holds the visible part.
  add column privacy_masked boolean not null default false,
  -- The whole track is inside the owner's zones: the row keeps it, and only the owner reads the route.
  add column privacy_hidden boolean not null default false;

alter policy "Public routes and own routes are readable" on public.routes
  using ((is_public and not privacy_hidden) or owner_id = (select auth.uid()));

-- Full data of masked routes ----------------------------------------------------------------------------------------

create table public.route_originals (
  route_id uuid primary key references public.routes (id) on delete cascade,
  geom extensions.geography(LineString, 4326) not null,
  distance_m double precision not null generated always as (extensions.st_length(geom)) stored,
  elevation_profile jsonb,
  elevation_gain_m double precision,
  elevation_loss_m double precision,
  editor_state jsonb,
  pois jsonb not null default '[]'::jsonb,
  way_info jsonb
);

alter table public.route_originals enable row level security;

-- The routes subquery is itself filtered by the routes policy; owners always see their own routes.
create policy "route_originals: owner only"
  on public.route_originals for all
  to authenticated
  using (exists (
    select 1 from public.routes r
    where r.id = route_originals.route_id and r.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.routes r
    where r.id = route_originals.route_id and r.owner_id = (select auth.uid())
  ));

-- Computed fields, like route_geojson and route_thumbnail on routes.
create function public.route_original_geojson(public.route_originals)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select extensions.st_asgeojson($1.geom, 6)::jsonb;
$$;

create function public.route_original_thumbnail(public.route_originals)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.track_thumbnail($1.geom);
$$;

revoke execute on function public.route_original_geojson(public.route_originals) from public, anon;
grant execute on function public.route_original_geojson(public.route_originals) to authenticated, service_role;
revoke execute on function public.route_original_thumbnail(public.route_originals) from public, anon;
grant execute on function public.route_original_thumbnail(public.route_originals) to authenticated, service_role;

-- Full GPS points of masked outings ---------------------------------------------------------------------------------

-- A member's outings are cut again when their zones change. The update policy of 20261107120000 already limits
-- updates to the member's own outings; this only adds the column.
grant update (track) on public.route_outings to authenticated;

create table public.outing_originals (
  outing_id uuid primary key references public.route_outings (id) on delete cascade,
  track jsonb not null check (
    case when jsonb_typeof(track) = 'array' then jsonb_array_length(track) between 2 and 10000 else false end
  )
);

alter table public.outing_originals enable row level security;

-- Only the member who recorded the outing, whoever owns the route.
create policy "outing_originals: recorder only"
  on public.outing_originals for all
  to authenticated
  using (exists (
    select 1 from public.route_outings o
    where o.id = outing_originals.outing_id and o.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.route_outings o
    where o.id = outing_originals.outing_id and o.user_id = (select auth.uid())
  ));
