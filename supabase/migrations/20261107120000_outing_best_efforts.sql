-- Best efforts of an outing (#140): its best moving times over set distances, and a cyclist's best hour,
-- worked out from its GPS points by the server the first time the member's records are needed, then kept, so
-- that the records never load every track. Null until then, and for outings without GPS points.
-- Shape: { v: version, kind: 'run' | 'walk' | 'ride', times: { <effort id>: seconds }, hour_m?: meters }.
alter table public.route_outings
  add column best_efforts jsonb
    constraint route_outings_best_efforts_object check (best_efforts is null or jsonb_typeof(best_efforts) = 'object');

-- Members fill in their own outings' best efforts, and change nothing else of them: a column they may change
-- later needs its own grant.
create policy "Users can update the best efforts of their own outings"
  on public.route_outings for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.route_outings from anon, authenticated;
grant update (best_efforts) on public.route_outings to authenticated;
