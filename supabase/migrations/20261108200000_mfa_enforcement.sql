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
-- Privacy zones (#254): the zones, and the full tracks their owner alone sees.
create policy "Two-factor members need a code" on public.privacy_zones
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.route_originals
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "Two-factor members need a code" on public.outing_originals
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

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

-- Same for the routing quota (the API also calls requireMfa): a direct call without the code spends nothing.
create or replace function public.consume_routing_quota(daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'Europe/Paris')::date;
  used integer;
begin
  if caller is null then
    raise exception 'consume_routing_quota: not signed in' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
    return -1;
  end if;
  -- Only today's counter matters.
  delete from public.routing_usage where user_id = caller and day < today;

  insert into public.routing_usage as usage (user_id, day, count)
  values (caller, today, 1)
  on conflict (user_id, day) do update set count = usage.count + 1
    where usage.count < daily_limit
  returning usage.count into used;

  if used is null or used > daily_limit then
    return -1;
  end if;
  return daily_limit - used;
end;
$$;
