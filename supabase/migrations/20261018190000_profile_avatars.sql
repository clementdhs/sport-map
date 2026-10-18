-- Profile photos (#150): one per member, shown instead of their initials. Files live in the private "avatars"
-- bucket under <user_id>/<file>, readable by signed-in members like profiles (20261003120000_family_only.sql),
-- written and removed by their owner only. profiles.avatar_path names the current file: each upload gets a new
-- name, so no cache keeps showing the previous photo; null means initials.

-- The column of the initial schema was never used by the app: renamed, emptied, and limited to a file of the
-- member's own folder (members update their profile row directly through the update policy).
alter table public.profiles rename column avatar_url to avatar_path;
update public.profiles set avatar_path = null where avatar_path is not null;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(webp|jpg)$'));

-- Private bucket: pages get signed URLs. The app uploads 256 px WebP or JPEG files of a few tens of kB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 262144, array['image/webp', 'image/jpeg']);

create policy "Avatars are readable by members"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

create policy "Members can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(objects.name))[1] = (select auth.uid())::text);

create policy "Members can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(objects.name))[1] = (select auth.uid())::text);

-- Route cards show their owner's photo: search_routes returns its path. New output column: the function is
-- dropped and recreated, unchanged otherwise (20261018150000_search_own_routes.sql).
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
