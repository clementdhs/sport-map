create extension if not exists postgis with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Falls back to a generated username when the requested one is missing, invalid or taken,
-- so that a username conflict never blocks sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  if v_username is null
     or v_username !~ '^[a-zA-Z0-9_]{3,30}$'
     or exists (select 1 from public.profiles where username = v_username) then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_username);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- routes --------------------------------------------------------------------

create type public.sport_type as enum ('running', 'hiking', 'cycling');
create type public.route_source as enum ('drawn', 'gpx_import');

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  sport_type public.sport_type not null default 'running',
  geom extensions.geography(LineString, 4326) not null,
  -- start_point and distance_m are derived from geom by trigger
  start_point extensions.geography(Point, 4326) not null,
  distance_m double precision not null,
  elevation_gain_m double precision,
  elevation_loss_m double precision,
  elevation_profile jsonb,
  cover_image_url text,
  is_public boolean not null default true,
  source public.route_source not null default 'drawn',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routes_start_point_gix on public.routes using gist (start_point);
create index routes_geom_gix on public.routes using gist (geom);
create index routes_owner_idx on public.routes (owner_id);
create index routes_public_created_idx on public.routes (created_at desc) where is_public;

create or replace function public.routes_derive_geometry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.start_point := extensions.st_startpoint(new.geom::extensions.geometry)::extensions.geography;
  new.distance_m := extensions.st_length(new.geom);
  return new;
end;
$$;

create trigger routes_derive_geometry
  before insert or update of geom on public.routes
  for each row execute function public.routes_derive_geometry();

create trigger routes_set_updated_at
  before update on public.routes
  for each row execute function public.set_updated_at();

-- route_activity ------------------------------------------------------------

create type public.activity_type as enum ('saved', 'completed');

create table public.route_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  activity_type public.activity_type not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, route_id, activity_type)
);

create index route_activity_route_idx on public.route_activity (route_id);

-- Row Level Security ----------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.route_activity enable row level security;

create policy "Profiles are readable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Public routes and own routes are readable"
  on public.routes for select
  using (is_public or owner_id = (select auth.uid()));

create policy "Users can create their own routes"
  on public.routes for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners can update their routes"
  on public.routes for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners can delete their routes"
  on public.routes for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Users can read their own activity"
  on public.route_activity for select
  to authenticated
  using (user_id = (select auth.uid()));

-- The routes subquery is itself filtered by routes RLS, so only visible routes can be tracked.
create policy "Users can track visible routes"
  on public.route_activity for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.routes r where r.id = route_id)
  );

create policy "Users can update their own activity"
  on public.route_activity for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own activity"
  on public.route_activity for delete
  to authenticated
  using (user_id = (select auth.uid()));
