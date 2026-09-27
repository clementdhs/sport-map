-- Public routes starting inside a map view, closest to the view's center first.
-- The bounds test uses plain lng/lat comparisons: a geography envelope misbehaves on very wide views.
create or replace function public.search_routes(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  sport public.sport_type default null,
  min_distance_m double precision default null,
  max_distance_m double precision default null,
  max_results integer default 50
)
returns table (
  id uuid,
  name text,
  sport_type public.sport_type,
  distance_m double precision,
  elevation_gain_m double precision,
  start_lng double precision,
  start_lat double precision,
  owner_username text,
  created_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    r.name,
    r.sport_type,
    r.distance_m,
    r.elevation_gain_m,
    extensions.st_x(r.start_point::extensions.geometry),
    extensions.st_y(r.start_point::extensions.geometry),
    p.username,
    r.created_at
  from public.routes r
  join public.profiles p on p.id = r.owner_id
  where r.is_public
    and extensions.st_x(r.start_point::extensions.geometry) between min_lng and max_lng
    and extensions.st_y(r.start_point::extensions.geometry) between min_lat and max_lat
    and (sport is null or r.sport_type = sport)
    and (min_distance_m is null or r.distance_m >= min_distance_m)
    and (max_distance_m is null or r.distance_m <= max_distance_m)
  order by r.start_point operator(extensions.<->) extensions.st_setsrid(
    extensions.st_makepoint((min_lng + max_lng) / 2, (min_lat + max_lat) / 2), 4326
  )::extensions.geography
  limit least(max_results, 100);
$$;
