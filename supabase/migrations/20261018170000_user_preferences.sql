-- Preferences kept in the member's account (#145) and found again on every device: basemap, 3D view, map
-- orientation, home filter, "Données" screen, voice guidance, and the settings of #143 to come. One JSON object
-- per member, key → value as the app saves it; the app parses each value and ignores what it doesn't know.
-- Read and written by the member alone. Removed with the account (cascade from the profile).
create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb
    constraint user_preferences_is_object check (jsonb_typeof(preferences) = 'object')
    -- A few short values: far more than any member needs.
    constraint user_preferences_size check (octet_length(preferences::text) <= 16384),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

create policy "Users can read their own preferences"
  on public.user_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can create their own preferences"
  on public.user_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own preferences"
  on public.user_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Saves the preferences changed on a device, key by key, in one statement: the keys another device changed
-- meanwhile are kept. Runs with the caller's rights, so the policies above apply.
create function public.update_my_preferences(changes jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.user_preferences as saved (user_id, preferences)
  values ((select auth.uid()), changes)
  on conflict (user_id) do update set preferences = saved.preferences || excluded.preferences;
$$;

revoke execute on function public.update_my_preferences(jsonb) from public, anon;
grant execute on function public.update_my_preferences(jsonb) to authenticated;
