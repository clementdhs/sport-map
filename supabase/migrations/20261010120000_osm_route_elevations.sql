-- Elevation gain and loss of OpenStreetMap marked routes (#71), shared by the family: OpenStreetMap has no
-- elevations, so the server computes them once per version of a route relation (Open-Meteo) and keeps them here.
-- A newer version of the relation is computed again and replaces the row.

create table public.osm_route_elevations (
  relation_id bigint primary key check (relation_id > 0),
  -- The relation's version when it was computed.
  version integer not null check (version > 0),
  distance_m integer not null check (distance_m >= 0),
  gain_m integer not null check (gain_m >= 0),
  loss_m integer not null check (loss_m >= 0),
  computed_at timestamptz not null default now()
);

alter table public.osm_route_elevations enable row level security;

-- Public map data, read by any member. No write policy: only the server writes it, with the service role, after
-- computing a route.
create policy "osm_route_elevations: readable by the family"
  on public.osm_route_elevations for select
  to authenticated
  using (true);
