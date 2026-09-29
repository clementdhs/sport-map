-- Daily routing quota per user: the OpenRouteService quota (2,000 requests a day, free) is shared by
-- everyone, so one user or bot must not use it all.

create table public.routing_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Paris calendar day.
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.routing_usage enable row level security;

-- Users read their own counter (data export); only consume_routing_quota writes it.
create policy "routing_usage: own rows are readable"
  on public.routing_usage for select
  to authenticated
  using (routing_usage.user_id = (select auth.uid()));

-- Counts one routing request for the caller and returns how many are left today, or -1 (and counts
-- nothing) once daily_limit is reached. Atomic: concurrent requests can't go over the limit.
create function public.consume_routing_quota(daily_limit integer)
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

revoke execute on function public.consume_routing_quota(integer) from public, anon;
grant execute on function public.consume_routing_quota(integer) to authenticated;
