-- The member's week for the coach (#283): how many outings a week (2 to 6, 3 until they say), optionally which
-- days (ISO weekdays, 1 = Monday to 7 = Sunday) and the day of the long run. None of them or exactly as many days
-- as outings; the long run on one of those days when there are some. The API sorts the days and drops duplicates.
alter table public.coach_goals
  add column outings_per_week smallint not null default 3 check (outings_per_week between 2 and 6),
  add column preferred_days smallint[] not null default '{}',
  add column long_run_day smallint check (long_run_day between 1 and 7),
  add constraint coach_goals_days check (
    cardinality(preferred_days) in (0, outings_per_week)
    and preferred_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and (long_run_day is null or cardinality(preferred_days) = 0 or long_run_day = any (preferred_days))
  );
