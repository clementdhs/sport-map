---
paths:
  - "app/pages/routes/*/follow.vue"
  - "app/pages/record.vue"
  - "app/components/map/RouteFollow.vue"
  - "app/utils/trackFollower.ts"
  - "app/utils/recorder.ts"
  - "app/composables/**"
  - "server/api/recordings.post.ts"
---

# Follow mode and outing recording

- Follow mode (`/routes/:id/follow`, no layout): `useWatchPosition` feeds `locateOnTrack` (`app/utils/trackFollower.ts`), which snaps each GPS fix to the track in a local flat frame and, where the track passes twice (loops, out-and-backs), keeps the passage closest to the previous progress. The screen is kept on with `useScreenWakeLock`. e2e tests drive it with Playwright's `geolocation` / `setGeolocation`.
- Outing recording (`/record`, no layout): pure functions in `app/utils/recorder.ts` over a serializable `Recording` (fix filtering, distance, moving time, pauses, GPS gaps), saved to `localStorage` after every point so an outing survives a closed page. `POST /api/recordings` stores the track as a route (`source: 'recorded'`) and a `completed` `route_activity` with `started_at`, `duration_s`, `moving_s`. A browser only records with the screen on; background recording would need a native wrapper (Capacitor). e2e tests drive it with `page.clock` and `setGeolocation`.
