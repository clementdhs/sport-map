-- Route cards show the owner's display name, or their username when they chose none: search_routes returns
-- owner_name instead of owner_username (a new return column means dropping and recreating the function).

drop function public.search_routes(
  double precision, double precision, double precision, double precision,
  public.sport_type, double precision, double precision, double precision, double precision,
  boolean, boolean, text, integer, text
);

-- Public routes starting inside a map view or, with passing_through, whose track crosses it.
-- With text_query, public routes whose name or description holds every word typed, wherever they are
-- (the view then only serves the "nearest" sort).
-- sort: nearest (to the view's center), recent, shortest, longest, best_rated.
-- marker_lng / marker_lat: where to pin the route on the map, i.e. its start, or with passing_through the
-- point of the track closest to the view's center (the start may be outside the view).
create function public.search_routes(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  sport public.sport_type default null,
  min_distance_m double precision default null,
  max_distance_m double precision default null,
  min_gain_m double precision default null,
  max_gain_m double precision default null,
  loops_only boolean default false,
  passing_through boolean default false,
  sort text default 'nearest',
  max_results integer default 50,
  text_query text default null
)
returns table (
  id uuid,
  name text,
  sport_type public.sport_type,
  distance_m double precision,
  elevation_gain_m double precision,
  is_loop boolean,
  rating_avg numeric,
  rating_count integer,
  marker_lng double precision,
  marker_lat double precision,
  owner_name text,
  created_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with map_view as (
    select
      extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326) as envelope,
      extensions.st_setsrid(
        extensions.st_makepoint((min_lng + max_lng) / 2, (min_lat + max_lat) / 2), 4326
      ) as center
  ),
  words as (
    select word from unnest(string_to_array(public.search_text(text_query), ' ')) as word where word <> ''
  ),
  -- Two branches, so each keeps its index: the map view's (GiST) or the text's (trigrams). The branch not
  -- asked for is skipped as a whole.
  found as (
    select
      r.*,
      case
        when passing_through then extensions.st_closestpoint(r.geom::extensions.geometry, v.center)
        else r.start_point::extensions.geometry
      end as marker,
      v.center
    from public.routes r, map_view v
    where text_query is null
      -- Any route starting in the view also has its bounding box in it: this indexed test narrows both searches.
      and r.geom::extensions.geometry operator(extensions.&&) v.envelope
      and case
        when passing_through then extensions.st_intersects(r.geom::extensions.geometry, v.envelope)
        else extensions.st_x(r.start_point::extensions.geometry) between min_lng and max_lng
          and extensions.st_y(r.start_point::extensions.geometry) between min_lat and max_lat
      end
      and r.is_public
    union all
    select r.*, r.start_point::extensions.geometry, v.center
    from public.routes r, map_view v
    where text_query is not null
      and r.is_public
      -- The longest word goes through the index; then every word must be there.
      and public.search_text(r.name || ' ' || coalesce(r.description, ''))
        like (select '%' || w.word || '%' from words w order by length(w.word) desc limit 1)
      and public.search_text(r.name || ' ' || coalesce(r.description, ''))
        like all (select '%' || w.word || '%' from words w)
  )
  select
    f.id,
    f.name,
    f.sport_type,
    f.distance_m,
    f.elevation_gain_m,
    f.is_loop,
    f.rating_avg,
    f.rating_count,
    extensions.st_x(f.marker),
    extensions.st_y(f.marker),
    coalesce(p.display_name, p.username),
    f.created_at
  from found f
  join public.profiles p on p.id = f.owner_id
  where (sport is null or f.sport_type = sport)
    and (min_distance_m is null or f.distance_m >= min_distance_m)
    and (max_distance_m is null or f.distance_m <= max_distance_m)
    -- A gain filter leaves out routes whose gain is unknown.
    and (min_gain_m is null or f.elevation_gain_m >= min_gain_m)
    and (max_gain_m is null or f.elevation_gain_m <= max_gain_m)
    and (not loops_only or f.is_loop)
  order by
    case when sort = 'recent' then f.created_at end desc,
    case when sort = 'shortest' then f.distance_m end asc,
    case when sort = 'longest' then f.distance_m end desc,
    case when sort = 'best_rated' then f.rating_avg end desc nulls last,
    case when sort = 'best_rated' then f.rating_count end desc,
    -- Distance from the pinned point, so the nearest pins come first.
    f.marker::extensions.geography operator(extensions.<->) f.center::extensions.geography
  limit least(max_results, 100);
$$;
