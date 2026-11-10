-- How an outing felt to the member who did it (#267): easy, ok, hard or very hard, given on the coach's review
-- after the outing. It weighs the outing's load in the coach's form (× 0.8 to × 1.3). Null until given.
alter table public.route_outings
  add column feeling text
    constraint route_outings_feeling check (feeling in ('easy', 'ok', 'hard', 'very_hard'));

-- Members set it on their own outings through the update policy of #140 ("Users can update the best efforts of
-- their own outings", user_id = auth.uid()), which only the column grants limit.
grant update (feeling) on public.route_outings to authenticated;
