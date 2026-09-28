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
- `routes.editor_state` stores how the editor built the track (waypoints, and each segment's mode and `start`/`end` index range in the saved track) so a route can be edited again without duplicating coordinates. Routes saved before it exist load as a single `locked` segment.
- MapLibre is imported only client-side (dynamic import in `onMounted`), and its worker URL is set via `?worker&url` (required by MapLibre 6 with Vite). In dev only, the console shows `ReferenceError: document is not defined` from Vite's client injected in that worker: harmless, absent from production builds.
- Testing maps in the desktop app's browser pane: MapLibre only finishes loading while the pane is visible (hidden tabs pause rendering).
- `routes.pois` holds the route's points of interest (`[{ type, coordinates, note? }]`, validated by `poiSchema`), saved with the route so they share its visibility. They are snapped onto the track when placed; on the map they are HTML markers (`MapPoiMarkers`) whose content is teleported so it can use Nuxt UI icons.
- Route photos: the owner uploads them from the route page. The browser resizes and re-encodes them (`compressPhoto`, WebP or JPEG, EXIF dropped), `POST /api/routes/:id/photos` checks the real type and the per-route limit, stores the file in the private `route-photos` bucket under `<route_id>/` and adds a `route_photos` row. Rows and files follow the route's visibility (RLS and storage policies); pages get signed URLs (1 h). Deleting a route removes its files first (the cascade only deletes rows).
- Reviews (`route_reviews`, one per user and route, not on one's own route) are moderated in the database: the route's owner hides a comment with `set_review_hidden`, a trigger hides it after 3 `review_reports`, and RLS only shows hidden reviews to their author and the route's owner. Their ratings keep counting: triggers maintain `routes.rating_avg` / `rating_count`, used by lists and the `best_rated` sort. Authors can only update `rating` and `comment` (column grants). Embed their author as `profiles!route_reviews_user_id_fkey`: `review_reports` makes a bare `profiles` ambiguous.
- Follow mode (`/routes/:id/follow`, no layout): `useWatchPosition` feeds `locateOnTrack` (`app/utils/trackFollower.ts`), which snaps each GPS fix to the track in a local flat frame and, where the track passes twice (loops, out-and-backs), keeps the passage closest to the previous progress. The screen is kept on with `useScreenWakeLock`. e2e tests drive it with Playwright's `geolocation` / `setGeolocation`.
- Outing recording (`/record`, no layout): pure functions in `app/utils/recorder.ts` over a serializable `Recording` (fix filtering, distance, moving time, pauses, GPS gaps), saved to `localStorage` after every point so an outing survives a closed page. `POST /api/recordings` stores the track as a route (`source: 'recorded'`) and a `completed` `route_activity` with `started_at`, `duration_s`, `moving_s`. A browser only records with the screen on; background recording would need a native wrapper (Capacitor). e2e tests drive it with `page.clock` and `setGeolocation`.
- Password reset: the recovery email (`supabase/templates/recovery.html`, set in `config.toml` locally and by hand in the hosted project's email templates) links to `/reset-password?token_hash=…&type=recovery`, verified with `verifyOtp`, so the link works in any browser (the default PKCE link only works where it was asked for). `NewPasswordForm` sets the password, there and in the profile. Locally, emails land in Mailpit (`npm run db:start` starts it); e2e tests read them through its API (`test/e2e/mail.ts`).
- Error monitoring: `@sentry/nuxt` (module skipped under Vitest), initialized in `sentry.client.config.ts` / `sentry.server.config.ts` only when `NUXT_PUBLIC_SENTRY_DSN` is set (never locally or in tests). Errors only (no tracing, no replay), no personal data (`PRIVATE_DATA_COLLECTION`: Sentry 11 collects cookies, headers, bodies, query params and user info by default), expected 3xx/4xx errors dropped and access tokens scrubbed from URLs (`shared/utils/errorReporting.ts`). Source maps upload on Vercel builds with `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`, then are deleted.
- Offline routes: the PWA uses its own service worker (`service-worker/sw.ts`, injectManifest, typed by `service-worker/tsconfig.json`, checked by `npm run typecheck`). "Préparer pour le hors-ligne" (`app/utils/offlineRoute.ts`) downloads the follow page, the route data and the map files MapLibre will request (style, sprites, fonts, TileJSON, tiles of the corridor, whole area at low zoom, neighbours for elevation tiles) into one Cache Storage cache per route; the service worker serves map hosts cache-first and the follow page/route API network-first with that fallback. MapTiler only allows a temporary personal cache on the device: caches expire after 30 days (purged at startup), never on a server. URLs must match MapLibre's exactly (`mapStyleUrl` is shared with `MapView`). Free MapTiler quota: 100k requests/month, a 30 km route costs ~650.
- `useFetch` data is a shallow ref (Nuxt 4 default): state a page changes after loading (e.g. photos, viewer activity) gets its own `ref`, since assigning a property of the fetched object doesn't re-render.
- Link previews: `GET /api/routes/:id/og.png` draws the track and key figures as SVG (`server/utils/ogImage.ts`) and renders it to PNG with `@resvg/resvg-js`, using the Inter fonts from `server/assets/fonts` (no map tiles: MapTiler static maps need a paid plan). It only serves public routes, whoever asks, because the image is cached publicly.
- Free-tier quotas matter: debounce OpenRouteService calls, serve images straight from Supabase Storage.
- APIs of Nuxt 4 / Nuxt UI 4 / MapLibre 6 / @nuxtjs/supabase 2 change fast: when unsure, check the official docs or the package's types in `node_modules` rather than relying on memory.

## Commands
- `npm run dev` — dev server on http://localhost:3000, on the hosted Supabase
- `npm run db:start` then `npm run dev:local` — same, on the local Supabase (Docker): try new migrations before pushing them. New migration files need `npx supabase migration up --local`.
- `npm run build` / `npm run preview`
- `npm run typecheck`
- `npx supabase link --project-ref <ref>` then `npm run db:push` — apply migrations to the hosted project
- `npm run db:types` — regenerate DB types (project must be linked)
- `npm test` — Vitest: `test/unit` (pure functions, Node, explicit imports with `#shared` / `~` aliases) and `test/nuxt` (Nuxt environment, for stores; mock API calls with `registerEndpoint`). Run it after any change.
- `npm run db:start` then `npm run test:e2e` — Playwright on the production build against the local Supabase (Docker). Test user and data are recreated by `test/e2e/global-setup.ts`; map style and `/api/routing/segment` are mocked in `test/e2e/fixtures.ts`. Never point e2e tests at the hosted project.

## Testing
- New logic in `shared/` or `app/utils/` gets unit tests; editor/store behaviour gets a `test/nuxt` test; user-facing flows get an e2e test.
- Maps: wait for `[data-map-loaded]` before interacting with a map in e2e tests.
