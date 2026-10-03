-- Outings recorded with the GPS on a route: a new route recorded from /record, or an existing route followed
-- and recorded at the same time, possibly several times and by several members. The route page lists them
-- against the estimated time, and the profile statistics count each of them.
create table public.route_outings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  started_at timestamptz not null,
  -- Elapsed time (pauses included) and time spent moving (s)
  duration_s integer not null check (duration_s >= 0),
  moving_s integer not null check (moving_s >= 0),
  -- Distance covered according to the GPS (m), which may differ from the route's
  distance_m real not null check (distance_m >= 0),
  created_at timestamptz not null default now(),
  constraint route_outings_moving_within_duration check (moving_s <= duration_s),
  -- A save sent again (lost answer, double tap) must not count the outing twice.
  constraint route_outings_once unique (user_id, route_id, started_at)
);

create index route_outings_route_idx on public.route_outings (route_id, started_at desc);

alter table public.route_outings enable row level security;

-- The routes subquery is itself filtered by routes RLS: outings share their route's visibility. Members keep
-- reading their own outings when the route's owner makes it private (data export).
create policy "Outings are readable with their route"
  on public.route_outings for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.routes r where r.id = route_outings.route_id)
  );

create policy "Users can record outings on visible routes"
  on public.route_outings for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.routes r where r.id = route_outings.route_id)
  );

create policy "Users can delete their own outings"
  on public.route_outings for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Outings already recorded from /record: their times are on the completed activity of their route.
insert into public.route_outings (user_id, route_id, started_at, duration_s, moving_s, distance_m, created_at)
select a.user_id, a.route_id, a.started_at, a.duration_s, a.moving_s, r.distance_m, a.created_at
from public.route_activity a
join public.routes r on r.id = a.route_id
where a.activity_type = 'completed'
  and a.started_at is not null
  and a.duration_s is not null
  and a.moving_s is not null;
