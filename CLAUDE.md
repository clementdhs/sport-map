# sport-map

Web app (installable PWA) to create, share and discover running / hiking / cycling routes on a map, in the spirit of OpenRunner. UI text is in French.

The backlog lives in GitHub issues (milestone "V1.1" = current priorities; labels for theme and effort), managed with the `gh` CLI. Reference the issue in the commit that completes it (`Closes #N`) and file new ideas as issues. `ROADMAP.md` only keeps the history of what was shipped.

## Stack
- Nuxt 4 (`app/` directory), Vue 3 `<script setup lang="ts">` + Composition API
- Nuxt UI 4 (Tailwind 4) — use its components (`UButton`, `UForm`, `UAuthForm`, `UModal`…) before writing custom CSS
- Pinia (setup-style stores in `app/stores/`)
- Nitro API routes in `server/api/` — no separate backend
- Supabase (`@nuxtjs/supabase`): Postgres + PostGIS, Auth, Storage
- MapLibre GL JS 6 + MapTiler tiles; OpenRouteService for routing/elevation; `@tmcw/togeojson` for GPX

## Conventions
- Secrets (`NUXT_OPENROUTESERVICE_KEY`, `NUXT_SUPABASE_SECRET_KEY`) are only read in `server/`. Only the MapTiler key and Supabase URL/publishable key are public.
- Server routes use `serverSupabaseClient(event)` (user session + RLS) by default; `serverSupabaseServiceRole` only when bypassing RLS is really required.
- Mutating routes check `await serverSupabaseUser(event)` and return 401 when missing.
- `useSupabaseUser()` / `serverSupabaseUser()` return JWT claims: the user id is `.sub`, not `.id`.
- API response types live in `shared/types/` and are used both as the handler's return type and as `useFetch<T>()`'s generic: the app's TS project can't resolve server-only aliases, so types inferred from handlers become `any`.
- Validation schemas (zod) live in `shared/utils/` and are shared by `UForm` and `readValidatedBody`.
- Every new table gets RLS enabled with explicit policies, in a new file under `supabase/migrations/` (never edit an applied migration).
- After a schema change, regenerate `shared/types/database.types.ts` with `npm run db:types`.
- Geometry is stored as `geography(…, 4326)`, inserted as EWKT (`SRID=4326;LINESTRING(...)`); `start_point` and `distance_m` on `routes` are generated columns. Read the track as GeoJSON with the `route_geojson` computed field.
- MapLibre is imported only client-side (dynamic import in `onMounted`), and its worker URL is set via `?worker&url` (required by MapLibre 6 with Vite). In dev only, the console shows `ReferenceError: document is not defined` from Vite's client injected in that worker: harmless, absent from production builds.
- Testing maps in the desktop app's browser pane: MapLibre only finishes loading while the pane is visible (hidden tabs pause rendering).
- Free-tier quotas matter: debounce OpenRouteService calls, serve images straight from Supabase Storage.
- APIs of Nuxt 4 / Nuxt UI 4 / MapLibre 6 / @nuxtjs/supabase 2 change fast: when unsure, check the official docs or the package's types in `node_modules` rather than relying on memory.

## Commands
- `npm run dev` — dev server on http://localhost:3000
- `npm run build` / `npm run preview`
- `npm run typecheck`
- `npx supabase link --project-ref <ref>` then `npm run db:push` — apply migrations to the hosted project
- `npm run db:types` — regenerate DB types (project must be linked)
