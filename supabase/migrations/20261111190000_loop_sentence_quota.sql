-- Daily quota of loop sentences per member (#216): each one is read by an LLM whose free tier (about 1,000
-- requests a day) is shared by everyone, so one member or bot must not use it all. Same shape as routing_usage.

create table public.loop_sentence_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Paris calendar day.
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.loop_sentence_usage enable row level security;

-- Members read their own counter; only consume_loop_sentence_quota writes it.
create policy "loop_sentence_usage: own rows are readable"
  on public.loop_sentence_usage for select
  to authenticated
  using (loop_sentence_usage.user_id = (select auth.uid()));

create policy "Two-factor members need a code"
  on public.loop_sentence_usage
  as restrictive
  for all
  to authenticated
  using ((select public.mfa_ok()))
  with check ((select public.mfa_ok()));

-- Counts one sentence for the caller and returns how many are left today, or -1 (and counts nothing) once
-- daily_limit is reached or without the second factor the account requires (#253). Atomic.
create function public.consume_loop_sentence_quota(daily_limit integer)
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
    raise exception 'consume_loop_sentence_quota: not signed in' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
    return -1;
  end if;
  -- Only today's counter matters.
  delete from public.loop_sentence_usage where user_id = caller and day < today;

  insert into public.loop_sentence_usage as usage (user_id, day, count)
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

revoke execute on function public.consume_loop_sentence_quota(integer) from public, anon;
grant execute on function public.consume_loop_sentence_quota(integer) to authenticated;
