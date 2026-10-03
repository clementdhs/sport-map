-- The app is for the family only: visitors who aren't signed in (role anon) can't read anything any more.
-- "Public" routes and collections are now visible to every signed-in member. Sign-ups are closed in the
-- Auth settings (config.toml locally, the dashboard for the hosted project): accounts are made by hand.

alter policy "Profiles are readable by everyone" on public.profiles to authenticated;
alter policy "Public routes and own routes are readable" on public.routes to authenticated;
alter policy "Photos are readable with their route" on public.route_photos to authenticated;
alter policy "Route photos are readable with their route" on storage.objects to authenticated;
alter policy "Reviews are readable with their route" on public.route_reviews to authenticated;
alter policy "Public collections and own collections are readable" on public.collections to authenticated;
alter policy "Links are readable when the collection and the route are" on public.collection_routes to authenticated;

-- Already empty for anon through the routes policy, but nobody else needs to call it.
revoke execute on function public.search_routes(
  double precision, double precision, double precision, double precision,
  public.sport_type, double precision, double precision, double precision, double precision,
  boolean, boolean, text, integer, text
) from public, anon;
grant execute on function public.search_routes(
  double precision, double precision, double precision, double precision,
  public.sport_type, double precision, double precision, double precision, double precision,
  boolean, boolean, text, integer, text
) to authenticated;
