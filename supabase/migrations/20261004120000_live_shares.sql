-- Live location sharing during an outing (follow mode or /record): the family sees where the member is, the
-- route followed and the track covered so far. Only explicitly started, at most one per member, removed when
-- the outing ends or 12 hours after it started at the latest: no position is kept beyond that.
create table public.live_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The route followed, none when recording freely.
  route_id uuid references public.routes (id) on delete set null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours',
  constraint live_shares_one_per_user unique (user_id)
);

-- The track covered since the share started, one point every 30 s or so. A point sent again after a lost
-- answer is ignored (primary key); the latest position is the latest fix, so a point arriving late never
-- replaces a newer one.
create table public.live_positions (
  share_id uuid not null references public.live_shares (id) on delete cascade,
  -- When the GPS took the fix, by the phone's clock.
  fixed_at timestamptz not null,
  lng double precision not null check (lng between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  accuracy_m real check (accuracy_m >= 0),
  primary key (share_id, fixed_at)
);

alter table public.live_shares enable row level security;
alter table public.live_positions enable row level security;

-- The whole family sees the shares in progress; members also see their own expired one until it's removed.
create policy "Live shares are readable by the family while in progress"
  on public.live_shares for select
  to authenticated
  using (expires_at > now() or user_id = (select auth.uid()));

-- On a route visible to its sharer (the routes subquery is filtered by routes RLS).
create policy "Users can start their own live share"
  on public.live_shares for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (route_id is null or exists (select 1 from public.routes r where r.id = live_shares.route_id))
  );

create policy "Users can stop their own live share"
  on public.live_shares for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- The live_shares subquery is itself filtered by live_shares RLS: points share their share's visibility.
create policy "Live positions are readable with their share"
  on public.live_positions for select
  to authenticated
  using (exists (select 1 from public.live_shares s where s.id = live_positions.share_id));

create policy "Users can add positions to their own share in progress"
  on public.live_positions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.live_shares s
      where s.id = live_positions.share_id and s.user_id = (select auth.uid()) and s.expires_at > now()
    )
  );

-- Shares whose end never reached the server (dead phone, no network when stopping) are removed once expired.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-expired-live-shares',
  '*/15 * * * *',
  $$ delete from public.live_shares where expires_at < now() $$
);
