-- Route cards (#232) show a member's quote and a "Fait ×N" stamp, without a request per card: both come with
-- the card's columns, as computed fields (route_quote, route_done_count in a PostgREST select) and as new
-- search_routes columns.

-- The latest visible review with a comment, as {"comment", "author"}; null without one. Hidden reviews are
-- left out even for their author and the route's owner, who can still read them on the route page.
-- Security invoker: the reviews' own policies apply. The comment is cut to 200 characters, the card shows two
-- lines at most.
create function public.route_quote(public.routes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('comment', left(btrim(rv.comment), 200), 'author', coalesce(p.display_name, p.username))
  from public.route_reviews rv
  join public.profiles p on p.id = rv.user_id
  where rv.route_id = $1.id
    and rv.hidden_at is null
    and nullif(btrim(rv.comment), '') is not null
  order by rv.created_at desc
  limit 1;
$$;

-- How many times the caller did the route: their recorded outings, a route only marked as done counting once
-- (as the route page's stamp). 0 for anyone else's outings: the stamp is the viewer's own.
create function public.route_done_count(public.routes)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
    (select count(*)::integer from public.route_outings o
      where o.route_id = $1.id and o.user_id = (select auth.uid())),
    exists (select 1 from public.route_activity a
      where a.route_id = $1.id and a.user_id = (select auth.uid()) and a.activity_type = 'completed')::integer
  );
$$;

revoke execute on function public.route_quote(public.routes) from public, anon;
grant execute on function public.route_quote(public.routes) to authenticated, service_role;
revoke execute on function public.route_done_count(public.routes) from public, anon;
grant execute on function public.route_done_count(public.routes) to authenticated, service_role;

-- search_routes returns both too. New output columns: the function is dropped and recreated, unchanged
-- otherwise (20261018190000_profile_avatars.sql).
drop function public.search_routes(
  double precision, double precision, double precision, double precision,
  public.sport_type, double precision, double precision, double precision, double precision,
  boolean, boolean, text, integer, text, boolean
);

-- Routes starting inside a map view or, with passing_through, whose track crosses it.
-- With text_query, routes whose name or description holds every word typed, wherever they are
-- (the view then only serves the "nearest" sort).
-- Routes searched: the team's (is_public) and the caller's own; with mine_only, the caller's own alone.
-- sort: nearest (to the view's center), recent, shortest, longest, best_rated.
-- marker_lng / marker_lat: where to pin the route on the map, i.e. its start, or with passing_through the
-- point of the track closest to the view's center (the start may be outside the view).
-- owner_avatar_path: the owner's profile photo in the "avatars" bucket, null when they chose none.
-- thumbnail: the outline drawn by route cards (track_thumbnail).
-- quote, done_count: the card's quote and stamp (route_quote, route_done_count).
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
  text_query text default null,
  mine_only boolean default false
)
returns table (
  id uuid,
  name text,
  sport_type public.sport_type,
  distance_m double precision,
  elevation_gain_m double precision,
  is_loop boolean,
  is_public boolean,
  rating_avg numeric,
  rating_count integer,
  marker_lng double precision,
  marker_lat double precision,
  owner_name text,
  owner_avatar_path text,
  thumbnail jsonb,
  created_at timestamptz,
  quote jsonb,
  done_count integer
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
  -- One branch per index: the map view's (GiST), the text's (trigrams, public routes only) and, for a text
  -- search, the owner's for the caller's routes the trigram index leaves out. Branches not asked for are
  -- skipped as a whole.
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
      and case when mine_only then r.owner_id = (select auth.uid()) else r.is_public or r.owner_id = (select auth.uid()) end
    union all
    -- The team's routes, the caller's public ones included.
    select r.*, r.start_point::extensions.geometry, v.center
    from public.routes r, map_view v
    where text_query is not null
      and not mine_only
      and r.is_public
      -- The longest word goes through the index; then every word must be there.
      and public.search_text(r.name || ' ' || coalesce(r.description, ''))
        like (select '%' || w.word || '%' from words w order by length(w.word) desc limit 1)
      and public.search_text(r.name || ' ' || coalesce(r.description, ''))
        like all (select '%' || w.word || '%' from words w)
    union all
    -- The caller's routes: all of them with mine_only, else the private ones the branch above left out.
    select r.*, r.start_point::extensions.geometry, v.center
    from public.routes r, map_view v
    where text_query is not null
      and r.owner_id = (select auth.uid())
      and (mine_only or not r.is_public)
      -- Text without any word (punctuation only) finds nothing, as in the branch above.
      and exists (select 1 from words)
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
    f.is_public,
    f.rating_avg,
    f.rating_count,
    extensions.st_x(f.marker),
    extensions.st_y(f.marker),
    coalesce(p.display_name, p.username),
    p.avatar_path,
    public.track_thumbnail(f.geom),
    f.created_at,
    -- f carries the view's columns too: the computed fields take the routes row itself.
    (select public.route_quote(r) from public.routes r where r.id = f.id),
    (select public.route_done_count(r) from public.routes r where r.id = f.id)
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

-- The app is for signed-in members only (20261003120000_family_only.sql).
revoke execute on function public.search_routes(
  double precision, double precision, double precision, double precision,
  public.sport_type, double precision, double precision, double precision, double precision,
  boolean, boolean, text, integer, text, boolean
) from public, anon;
grant execute on function public.search_routes(
  double precision, double precision, double precision, double precision,
  public.sport_type, double precision, double precision, double precision, double precision,
  boolean, boolean, text, integer, text, boolean
) to authenticated;
