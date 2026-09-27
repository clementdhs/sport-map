-- Generated columns instead of a trigger: same values, but clients (and generated types) no longer
-- see start_point / distance_m as required on insert.
drop trigger routes_derive_geometry on public.routes;
drop function public.routes_derive_geometry();

alter table public.routes
  drop column start_point,
  drop column distance_m;

alter table public.routes
  add column start_point extensions.geography(Point, 4326) not null
    generated always as (extensions.st_startpoint(geom::extensions.geometry)::extensions.geography) stored,
  add column distance_m double precision not null
    generated always as (extensions.st_length(geom)) stored;

create index routes_start_point_gix on public.routes using gist (start_point);

-- An unnamed row parameter is what PostgREST clients recognise as a computed field.
drop function public.route_geojson(public.routes);

create function public.route_geojson(public.routes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select extensions.st_asgeojson($1.geom, 6)::jsonb;
$$;
