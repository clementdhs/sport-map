---
paths:
  - "supabase/migrations/*live_shares*"
  - "server/api/live/**"
  - "server/utils/live.ts"
  - "shared/utils/live.ts"
  - "shared/types/live.ts"
  - "app/utils/liveShare.ts"
  - "app/composables/useLiveShare.ts"
  - "app/composables/usePolling.ts"
  - "app/components/live/LiveShareControl.vue"
  - "app/components/live/LiveLastPosition.vue"
  - "app/components/live/LiveSharesBanner.vue"
  - "app/components/map/LiveShare.vue"
  - "app/pages/live/**"
  - "app/components/live/LiveShareCard.vue"
  - "shared/utils/liveThumbnail.ts"
---

# Live location sharing (#46)

- Tables: `live_shares` (one per member at a time, `unique (user_id)`, `expires_at` = start + 12 h) and `live_positions` (the track, primary key `(share_id, fixed_at)`). RLS: the whole team reads shares not expired, only the sharer writes; points are only accepted on the sharer's own share in progress. A pg_cron job (`purge-expired-live-shares`, every 15 min) deletes expired shares and their track: nothing outlives the outing.
- API (`server/api/live/`): `POST /api/live` starts (replacing the member's previous share whose end never reached the server), `POST /:id/points` adds points (upsert ignoring duplicates, so a resend after a lost answer is harmless; the latest position is the latest `fixed_at`, so a late point never replaces a newer one; 404 once stopped or expired), `DELETE /:id` stops, `GET /api/live` lists, `GET /:id?after=` returns a share with its points (only newer ones with `after`, without route geometry). `route` is what the viewer may open (RLS); the route's track itself is sent even when private (service role, only then), since the sharer chose to share it.
- Phone side (`useLiveShare`, pure queue in `app/utils/liveShare.ts`): only after the confirmation of `LiveShareControl`. "Partager ma position" (central button menu and header, #262, and the yellow button of `/live`) opens `/record?share=1`: the control gets `ask` and opens its confirmation by itself when it shows (outing started or draft resumed), once per page visit; the member still confirms. One point every 30 s (fixes worse than 100 m skipped), the waiting ones sent in order at most every 30 s, from GPS updates (which keep coming with the screen off in the Android app) and a 5 s timer; a network gap fills in afterwards. Stops when the page unmounts (follow mode left, recording saved or discarded on /record, where it's offered only once the outing has started) and on `pagehide` (keepalive DELETE). A reloaded page doesn't resume: sharing again needs a tap.
- Team side: `/live` (list, #237: a "Partager ma position" box on the ink with a yellow `--sign` button to `/record?share=1`, hidden while the member shares; then `LiveShareCard`s: a mini-map from `liveThumbnail` (`shared/utils/liveThumbnail.ts`, route and track in one 350×120 projection, built by `GET /api/live?map=true` (the home banner leaves `map` out and gets none of it), which then reads every share's points and the routes' sport and `route_thumbnail` with the service role, like the full map), the route's sport with its `SportMark`, the distance covered and `LiveLastPosition compact`), `/live/:id` (full-screen map: route in orange, track in the GPS blue, latest position as the GPS dot), `LiveSharesBanner` on the home page (each member out leads to `/live/:id`; with several, "Voir tout" leads to `/live`). Since #262 `/live` has no tab in the main navigation (Coach took it): the banner and `/live/:id`'s "Voir les sorties en cours" lead to it. `usePolling` refreshes every 20 s (home banner: 60 s) only while the page is visible. "x min ago" is only rendered after mount (`now` null on the server); times use `formatTime` (Europe/Paris, like dates). Older than 5 min, the latest position turns orange.
- Point times come back from Postgres as `…+00:00` with trimmed milliseconds: compare them as dates (`mergeLivePoints`), not strings.
- e2e: all in `specs/live.spec.ts`, since every member sees every share and its tests must not run at the same time as another share: API and phone side as the test account (fake clock + `setGeolocation`, `context.setOffline` for the network gap), team side as a team member (the test account shares through `requestAs('account')`, `page.clock.fastForward` runs the refreshes). The banner with several members out is tested on a mocked `GET /api/live` (`**/api/live`, the banner's request only: `/live` asks with `?map=true`), so that no real share runs beside the others. The file deletes the worker users' shares before and after each test, so a failed try never leaves one to its retry or to the next test (#211). With the fake clock, wait for each fix to be kept (`live-status`'s `data-waiting`, the count the text only shows from 2) before the next `fastForward`: a position arriving after it would be dated 30 s later and the next one skipped. Test share ids must be real v4 uuids: zod's `z.uuid()` rejects `2222…`-style ones as a 404.
