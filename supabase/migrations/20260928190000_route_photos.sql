-- Photos of a route, uploaded by its owner. Files live in the private "route-photos" bucket under
-- <route_id>/<file>; both the rows and the files are readable exactly when the route is.
-- Columns of the protected table are qualified in the policies: inside the subqueries on routes, a bare
-- "name" would be the route's name, not the file's.

create table public.route_photos (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index route_photos_route_id_idx on public.route_photos (route_id, created_at);

alter table public.route_photos enable row level security;

create policy "Photos are readable with their route"
  on public.route_photos for select
  using (exists (
    select 1 from public.routes r
    where r.id = route_photos.route_id and (r.is_public or r.owner_id = (select auth.uid()))
  ));

create policy "Owners can add photos to their routes"
  on public.route_photos for insert
  to authenticated
  with check (
    storage_path like route_photos.route_id::text || '/%'
    and exists (select 1 from public.routes r where r.id = route_photos.route_id and r.owner_id = (select auth.uid()))
  );

create policy "Owners can delete photos of their routes"
  on public.route_photos for delete
  to authenticated
  using (exists (select 1 from public.routes r where r.id = route_photos.route_id and r.owner_id = (select auth.uid())));

-- Private bucket: files are served through signed URLs. The app uploads compressed WebP or JPEG files,
-- well under the size limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('route-photos', 'route-photos', false, 2097152, array['image/webp', 'image/jpeg']);

create policy "Route photos are readable with their route"
  on storage.objects for select
  using (
    bucket_id = 'route-photos'
    and exists (
      select 1 from public.routes r
      where r.id::text = (storage.foldername(objects.name))[1] and (r.is_public or r.owner_id = (select auth.uid()))
    )
  );

create policy "Owners can upload photos of their routes"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'route-photos'
    and exists (
      select 1 from public.routes r
      where r.id::text = (storage.foldername(objects.name))[1] and r.owner_id = (select auth.uid())
    )
  );

create policy "Owners can delete photos of their routes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'route-photos'
    and exists (
      select 1 from public.routes r
      where r.id::text = (storage.foldername(objects.name))[1] and r.owner_id = (select auth.uid())
    )
  );
