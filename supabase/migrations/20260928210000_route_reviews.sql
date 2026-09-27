-- Ratings (1 to 5) and comments on routes, one review per user and route, with moderation: the route's
-- owner can hide a comment, and a comment reported by 3 users is hidden automatically. A hidden review
-- keeps counting in the average, so owners can't improve their rating by hiding bad reviews.

-- Kept up to date by a trigger, for lists and search.
alter table public.routes
  add column rating_count integer not null default 0,
  add column rating_avg numeric(3, 2);

create table public.route_reviews (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  hidden_at timestamptz,
  -- owner: hidden by the route's owner; reports: hidden after enough reports
  hidden_reason text check (hidden_reason in ('owner', 'reports')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, user_id)
);

create index route_reviews_route_id_idx on public.route_reviews (route_id, created_at desc);

create trigger route_reviews_set_updated_at
  before update on public.route_reviews
  for each row execute function public.set_updated_at();

alter table public.route_reviews enable row level security;

-- Hidden reviews stay visible to their author and to the route's owner only.
create policy "Reviews are readable with their route"
  on public.route_reviews for select
  using (exists (
    select 1 from public.routes r
    where r.id = route_reviews.route_id
      and (r.is_public or r.owner_id = (select auth.uid()))
      and (
        route_reviews.hidden_at is null
        or route_reviews.user_id = (select auth.uid())
        or r.owner_id = (select auth.uid())
      )
  ));

create policy "Users can review public routes of others"
  on public.route_reviews for insert
  to authenticated
  with check (
    route_reviews.user_id = (select auth.uid())
    and route_reviews.hidden_at is null
    and route_reviews.hidden_reason is null
    and exists (
      select 1 from public.routes r
      where r.id = route_reviews.route_id and r.is_public and r.owner_id <> (select auth.uid())
    )
  );

create policy "Authors can edit their review"
  on public.route_reviews for update
  to authenticated
  using (route_reviews.user_id = (select auth.uid()))
  with check (route_reviews.user_id = (select auth.uid()));

create policy "Authors can delete their review"
  on public.route_reviews for delete
  to authenticated
  using (route_reviews.user_id = (select auth.uid()));

-- Authors may only change their rating and comment: hiding goes through set_review_hidden.
revoke update on public.route_reviews from anon, authenticated;
grant update (rating, comment) on public.route_reviews to authenticated;

create table public.review_reports (
  review_id uuid not null references public.route_reviews (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, reporter_id)
);

alter table public.review_reports enable row level security;

-- Reporters see their own reports; the route's owner sees all reports on its reviews.
create policy "Reporters and route owners can read reports"
  on public.review_reports for select
  to authenticated
  using (
    review_reports.reporter_id = (select auth.uid())
    or exists (
      select 1 from public.route_reviews v
      join public.routes r on r.id = v.route_id
      where v.id = review_reports.review_id and r.owner_id = (select auth.uid())
    )
  );

create policy "Users can report reviews of others"
  on public.review_reports for insert
  to authenticated
  with check (
    review_reports.reporter_id = (select auth.uid())
    and exists (
      select 1 from public.route_reviews v
      where v.id = review_reports.review_id and v.user_id <> (select auth.uid())
    )
  );

-- Recomputes a route's rating. Security definer: reviewers can't update routes themselves.
create function public.refresh_route_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route_id uuid := coalesce(new.route_id, old.route_id);
begin
  update public.routes r
  set rating_count = s.count, rating_avg = s.avg
  from (
    select count(*)::integer as count, round(avg(rating), 2) as avg
    from public.route_reviews
    where route_id = v_route_id
  ) s
  where r.id = v_route_id;
  return null;
end;
$$;

create trigger route_reviews_refresh_rating
  after insert or delete or update of rating on public.route_reviews
  for each row execute function public.refresh_route_rating();

-- Hides a review once 3 different users have reported it.
create function public.hide_reported_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.route_reviews
  set hidden_at = now(), hidden_reason = 'reports'
  where id = new.review_id
    and hidden_at is null
    and (select count(*) from public.review_reports where review_id = new.review_id) >= 3;
  return null;
end;
$$;

create trigger review_reports_hide_reported
  after insert on public.review_reports
  for each row execute function public.hide_reported_review();

-- Lets the route's owner hide or show again a review of its route.
create function public.set_review_hidden(review_id uuid, hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.route_reviews v
  set hidden_at = case when hidden then now() end,
      hidden_reason = case when hidden then 'owner' end
  from public.routes r
  where v.id = set_review_hidden.review_id
    and r.id = v.route_id
    and r.owner_id = auth.uid();
  return found;
end;
$$;

revoke execute on function public.set_review_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_review_hidden(uuid, boolean) to authenticated;

-- search_routes returns the rating and gains a "best_rated" sort (unrated routes last).
drop function public.search_routes(
  double precision, double precision, double precision, double precision,
  public.sport_type, double precision, double precision, double precision, double precision,
  boolean, boolean, text, integer
);

-- Public routes starting inside a map view or, with passing_through, whose track crosses it.
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
  max_results integer default 50
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
  owner_username text,
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
  found as (
    select
      r.*,
      case
        when passing_through then extensions.st_closestpoint(r.geom::extensions.geometry, v.center)
        else r.start_point::extensions.geometry
      end as marker,
      v.center
    from public.routes r, map_view v
    -- Any route starting in the view also has its bounding box in it: this indexed test narrows both searches.
    where r.geom::extensions.geometry operator(extensions.&&) v.envelope
      and case
        when passing_through then extensions.st_intersects(r.geom::extensions.geometry, v.envelope)
        else extensions.st_x(r.start_point::extensions.geometry) between min_lng and max_lng
          and extensions.st_y(r.start_point::extensions.geometry) between min_lat and max_lat
      end
      and r.is_public
      and (sport is null or r.sport_type = sport)
      and (min_distance_m is null or r.distance_m >= min_distance_m)
      and (max_distance_m is null or r.distance_m <= max_distance_m)
      -- A gain filter leaves out routes whose gain is unknown.
      and (min_gain_m is null or r.elevation_gain_m >= min_gain_m)
      and (max_gain_m is null or r.elevation_gain_m <= max_gain_m)
      and (not loops_only or r.is_loop)
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
    p.username,
    f.created_at
  from found f
  join public.profiles p on p.id = f.owner_id
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
