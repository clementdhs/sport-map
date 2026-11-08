---
paths:
  - "supabase/**"
  - "shared/types/database.types.ts"
---

# Supabase migrations

- One new file per change under `supabase/migrations/`; never edit an applied one. RLS enabled on every table, with explicit policies.
- Two-factor authentication (#253): every new table also gets `create policy "Two-factor members need a code" on public.x as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))`, and a security definer function members can call checks `public.mfa_ok()` itself, since RLS doesn't stop it (`family-access.md`).
- A table holding user data references `profiles` (or `routes`) `on delete cascade`, so deleting an account removes it, and is added to the data export (`server/api/profile/me/export.get.ts`). Files in storage don't cascade: remove them in code.
- Inside policy subqueries, qualify the table's own columns (`collections.owner_id`), or they resolve to the subquery's table.
- PostgREST computed fields take one unnamed row parameter (`create function public.x(public.routes) … $1`), `stable`, `set search_path = ''`, with schema-qualified PostGIS calls (`extensions.st_…`). Generated types show them as a Row column.
- Try RLS locally before pushing: apply with `npx supabase migration up --local`, then run a SQL script through the local database container's `psql`, switching users with `set local role authenticated` and `set local request.jwt.claims`.
- After `npm run db:push`, replace `shared/types/database.types.ts` with the output of `npx supabase gen types typescript --linked` (drop the BOM PowerShell adds), rather than keeping hand edits.
