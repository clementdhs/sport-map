# sport-map

Web app (installable PWA) to create, share and discover running / hiking / cycling routes on a map, in the spirit of OpenRunner. UI text is in French.

The backlog lives in GitHub issues (milestones and labels for theme and effort), managed with the `gh` CLI. Reference the issue in the commit that completes it (`Closes #N`) and file new ideas as issues. `ROADMAP.md` only keeps the history of what was shipped. The `ship-issue` skill describes how an issue is tested, committed and pushed.

Notes specific to one feature (map, mobile bottom sheet, editor, photos, reviews, follow/record, offline, weather, stats, slopes, surface and trail difficulty, collections, auth emails, Sentry, link previews, Android app, live location sharing, OSM marked routes) live in `.claude/rules/` and load when the matching files are read. When a feature adds a non-obvious rule, write it there, not here.

## Stack
- Nuxt 4 (`app/` directory), Vue 3 `<script setup lang="ts">` + Composition API
- Nuxt UI 4 (Tailwind 4): use its components (`UButton`, `UForm`, `UModal`…) before writing custom CSS
- Pinia (setup-style stores in `app/stores/`)
- Nitro API routes in `server/api/`, no separate backend
- Supabase (`@nuxtjs/supabase`): Postgres + PostGIS, Auth, Storage
- MapLibre GL JS 6 + MapTiler tiles; OpenRouteService for routing/elevation; `@tmcw/togeojson` for GPX

## Conventions
- Secrets (`NUXT_OPENROUTESERVICE_KEY`, `NUXT_SUPABASE_SECRET_KEY`) are only read in `server/`. Only the MapTiler key and Supabase URL/publishable key are public.
- Server routes use `serverSupabaseClient(event)` (user session + RLS) by default; `serverSupabaseServiceRole` only when bypassing RLS is really required.
- Mutating routes check `await serverSupabaseUser(event)` and return 401 when missing.
- `useSupabaseUser()` / `serverSupabaseUser()` return JWT claims: the user id is `.sub`, not `.id`.
- API response types live in `shared/types/` and are used both as the handler's return type and as `useFetch<T>()`'s generic: the app's TS project can't resolve server-only aliases, so types inferred from handlers become `any`.
- Validation schemas (zod) live in `shared/utils/` and are shared by `UForm` (through `useLocalizedSchema`) and the API (`readLocalizedBody` / `getLocalizedQuery`). Their messages are translation keys.
- API errors: `throw apiError(event, status, 'api.…')` (`server/utils/messages.ts`), whose statusMessage is written in the request's language (locale cookie, else `Accept-Language`); pages show it as is.
- Every new table gets RLS enabled with explicit policies, in a new file under `supabase/migrations/` (never edit an applied migration).
- Auto-imported `utils/` files: an exported function returning an inline object type with several properties (`): { a: A, b: B } {`) hides the next export from the scanner (mlly) when no comment line comes between them. Prefer a named type.
- `useFetch` data is a shallow ref (Nuxt 4 default): state a page changes after loading gets its own `ref`, since assigning a property of the fetched object doesn't re-render.
- Free-tier quotas matter: debounce OpenRouteService calls, serve images straight from Supabase Storage, mind MapTiler's 100k requests/month.
- APIs of Nuxt 4 / Nuxt UI 4 / MapLibre 6 / @nuxtjs/supabase 2 change fast: when unsure, check the official docs or the package's types in `node_modules` rather than relying on memory.

## Commands
- `npm run dev`: dev server on http://localhost:3000, on the hosted Supabase
- `npm run db:start` then `npm run dev:local`: same, on the local Supabase (Docker), to try new migrations before pushing them. New migration files need `npx supabase migration up --local`.
- `npm run build` / `npm run preview`
- `npm run typecheck`
- `npm run android:sync` / `npm run android:open`: Capacitor Android app (needs Android Studio)
- `npm run db:push`: apply migrations to the hosted project (linked)
- `npm run db:types`: regenerate DB types (project must be linked)
- `npm test`: Vitest, `test/unit` (pure functions, Node, explicit imports with `#shared` / `~` aliases) and `test/nuxt` (Nuxt environment, for stores; mock API calls with `registerEndpoint`). Run it after any change.
- `npm run db:start` then `npm run test:e2e`: Playwright on the production build against the local Supabase (Docker); `E2E_SKIP_BUILD=1` reuses an existing `npm run build`. Test users and data are recreated by `test/e2e/global-setup.ts`; map style and `/api/routing/segment` are mocked in `test/e2e/fixtures.ts`. Never point e2e tests at the hosted project.

## Testing
- New logic in `shared/` or `app/utils/` gets unit tests; editor/store behaviour gets a `test/nuxt` test; user-facing flows get an e2e test.
- Maps: wait for `[data-map-loaded]` before interacting with a map in e2e tests.
