-- Optional two-factor authentication (#253): a member who turned on a TOTP app must have typed a code in this
-- session (aal2) before reading or writing anything. Members without a verified factor are not affected.
-- Restrictive policies are ANDed with the permissive ones already there, so they only take rights away; they
-- apply to direct calls to Supabase too, not only to the app's API (service role routes check requireMfa).
-- A table added later needs the same policy (.claude/rules/migrations.md).

-- True when the caller's session is aal2, or when the caller has no verified factor. Security definer: the
-- authenticated role can't read auth.mfa_factors. Wrapped in (select …) in the policies so it runs once per
-- statement, not once per row.
create function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors
      where mfa_factors.user_id = (select auth.uid())
        and mfa_factors.status = 'verified'
    );
$$;

revoke execute on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated, service_role;

create policy "Two-factor members need a code" on public.profiles
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.routes
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.route_photos
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.route_reviews
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.review_reports
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.route_outings
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.route_activity
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.route_osm_places
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.collections
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.collection_routes
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.live_shares
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.live_positions
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.user_preferences
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.osm_route_elevations
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
-- Only reached through security definer functions or the service role today; covered in case a policy for
-- members is added later.
create policy "Two-factor members need a code" on public.login_attempts
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.routing_usage
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
-- TODO(#254): privacy_zones, route_originals, outing_originals once #254 is merged.

-- Route photos and profile photos (the only buckets).
create policy "Two-factor members need a code" on storage.objects
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Security definer, so RLS doesn't stop it: checks the code itself.
create or replace function public.set_review_hidden(review_id uuid, hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.mfa_ok() then
    return false;
  end if;
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
