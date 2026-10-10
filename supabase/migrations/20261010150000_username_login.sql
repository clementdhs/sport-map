-- Signing in with a username (POST /api/auth/login) as well as an e-mail: usernames become case-insensitive,
-- the server finds a username's e-mail, and repeated attempts are limited.

-- "Clem" and "clem" are the same account. Fails if two usernames only differ by case: rename one first.
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- Same as before, but a username taken with another case also falls back to a generated one, so the index
-- above never blocks sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  if v_username is null
     or v_username !~ '^[a-zA-Z0-9_]{3,30}$'
     or exists (select 1 from public.profiles where lower(username) = lower(v_username)) then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_username);
  return new;
end;
$$;

-- The e-mail of the account with this username, whatever its case. Only the server calls it (service role):
-- the e-mail is never sent to the browser, so a username can't be used to find an address.
create function public.login_email(login_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select users.email::text
  from public.profiles
  join auth.users on users.id = profiles.id
  where lower(profiles.username) = lower(login_username)
$$;

revoke execute on function public.login_email(text) from public, anon, authenticated;
grant execute on function public.login_email(text) to service_role;

-- Sign-in attempts with a username, per typed username ("user:…") and per caller IP ("ip:…"), in a fixed
-- window that starts with the first attempt. Every sign-in goes through Vercel's IPs, so Supabase's own limit
-- per IP no longer tells visitors apart. Rows only live for one window and belong to no account.
create table public.login_attempts (
  key text primary key,
  started_at timestamptz not null default now(),
  count integer not null default 1 check (count > 0)
);

-- For the purge of past windows, on every attempt.
create index login_attempts_started_at_idx on public.login_attempts (started_at);

alter table public.login_attempts enable row level security;
-- No policy: only the server (service role) reads and writes it.
revoke all on public.login_attempts from anon, authenticated;

-- Counts one attempt for the IP, then the username; false once either went over its limit within the window.
-- Atomic per key, like consume_routing_quota.
create function public.consume_login_attempt(
  username_key text,
  ip_key text,
  username_limit integer,
  ip_limit integer,
  window_seconds integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  username_count integer;
  ip_count integer;
begin
  delete from public.login_attempts where started_at < now() - make_interval(secs => window_seconds);

  insert into public.login_attempts as attempts (key) values (ip_key)
  on conflict (key) do update set count = attempts.count + 1
  returning attempts.count into ip_count;
  -- Past its limit, an IP trying made-up usernames adds no more rows.
  if ip_count > ip_limit then
    return false;
  end if;

  insert into public.login_attempts as attempts (key) values (username_key)
  on conflict (key) do update set count = attempts.count + 1
  returning attempts.count into username_count;

  return username_count <= username_limit;
end;
$$;

revoke execute on function public.consume_login_attempt(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_login_attempt(text, text, integer, integer, integer) to service_role;
