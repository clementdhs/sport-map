-- The coach's goal (#264): what the member trains for, which steers the session of the day. Ease back in, progress,
-- or get ready for a race on a given date, with its distance and gain. One row per member, read and written by the
-- member alone; none until they pick one (the coach then aims at progress). Removed with the account (cascade).
create table public.coach_goals (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('resume', 'progress', 'race')),
  race_date date,
  -- From a 1 km race to a 300 km ultra, up to 20 000 m of gain.
  race_distance_m integer check (race_distance_m between 1000 and 300000),
  race_gain_m integer check (race_gain_m between 0 and 20000),
  updated_at timestamptz not null default now(),
  -- A race has its date and distance (its gain may be unknown); the other goals have none of them.
  constraint coach_goals_race check (
    case when kind = 'race'
      then race_date is not null and race_distance_m is not null
      else race_date is null and race_distance_m is null and race_gain_m is null
    end
  )
);

create trigger coach_goals_set_updated_at
  before update on public.coach_goals
  for each row execute function public.set_updated_at();

alter table public.coach_goals enable row level security;

create policy "coach_goals: readable by their member"
  on public.coach_goals for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "coach_goals: created by their member"
  on public.coach_goals for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "coach_goals: changed by their member"
  on public.coach_goals for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Two-factor authentication (#253), like every table.
create policy "Two-factor members need a code" on public.coach_goals
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
