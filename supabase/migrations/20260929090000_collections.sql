-- Named collections of routes ("Week-end à Annecy"), private or shared. The routes of a collection keep
-- their own visibility: a visitor never sees a private route, even in a public collection. Deleting a route
-- or a collection removes the links (cascade).

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index collections_owner_id_idx on public.collections (owner_id, created_at desc);

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

alter table public.collections enable row level security;

create policy "Public collections and own collections are readable"
  on public.collections for select
  using (collections.is_public or collections.owner_id = (select auth.uid()));

create policy "Users can create their own collections"
  on public.collections for insert
  to authenticated
  with check (collections.owner_id = (select auth.uid()));

create policy "Owners can update their collections"
  on public.collections for update
  to authenticated
  using (collections.owner_id = (select auth.uid()))
  with check (collections.owner_id = (select auth.uid()));

create policy "Owners can delete their collections"
  on public.collections for delete
  to authenticated
  using (collections.owner_id = (select auth.uid()));

create table public.collection_routes (
  collection_id uuid not null references public.collections (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, route_id)
);

create index collection_routes_route_id_idx on public.collection_routes (route_id);

alter table public.collection_routes enable row level security;

-- Readable when both the collection and the route are.
create policy "Links are readable when the collection and the route are"
  on public.collection_routes for select
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_routes.collection_id and (c.is_public or c.owner_id = (select auth.uid()))
    )
    and exists (
      select 1 from public.routes r
      where r.id = collection_routes.route_id and (r.is_public or r.owner_id = (select auth.uid()))
    )
  );

-- Owners add routes they can see (theirs, or public ones of others) to their collections.
create policy "Owners can add visible routes to their collections"
  on public.collection_routes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_routes.collection_id and c.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.routes r
      where r.id = collection_routes.route_id and (r.is_public or r.owner_id = (select auth.uid()))
    )
  );

create policy "Owners can remove routes from their collections"
  on public.collection_routes for delete
  to authenticated
  using (exists (
    select 1 from public.collections c
    where c.id = collection_routes.collection_id and c.owner_id = (select auth.uid())
  ));

-- Computed field: a lighter track (simplified to ~10 m) to draw many routes at once, e.g. a collection's map.
create function public.route_preview(public.routes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select extensions.st_asgeojson(extensions.st_simplify($1.geom::extensions.geometry, 0.0001), 5)::jsonb;
$$;
