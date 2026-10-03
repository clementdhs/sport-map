---
paths:
  - "app/pages/routes/*/follow.vue"
  - "app/pages/record.vue"
  - "app/components/map/RouteFollow.vue"
  - "app/utils/trackFollower.ts"
  - "app/utils/recorder.ts"
  - "app/utils/liveStats.ts"
  - "app/components/LiveData.vue"
  - "app/composables/**"
  - "server/api/recordings.post.ts"
---

# Follow mode and outing recording

- Follow mode (`/routes/:id/follow`, no layout): `useWatchPosition` feeds `locateOnTrack` (`app/utils/trackFollower.ts`), which snaps each GPS fix to the track in a local flat frame and, where the track passes twice (loops, out-and-backs), keeps the passage closest to the previous progress. The screen is kept on with `useScreenWakeLock`. e2e tests drive it with Playwright's `geolocation` / `setGeolocation`.
- Outing recording (`/record`, no layout): pure functions in `app/utils/recorder.ts` over a serializable `Recording` (fix filtering, distance, moving time, pauses, GPS gaps), saved to `localStorage` after every point so an outing survives a closed page. `POST /api/recordings` stores the track as a route (`source: 'recorded'`) and a `completed` `route_activity` with `started_at`, `duration_s`, `moving_s`. A browser only records with the screen on; the Android app records with the screen off (`.claude/rules/android.md`). e2e tests drive it with `page.clock` and `setGeolocation`.
- Data screen (`LiveData.vue`, "Données" button of both pages): big values over the map, which stays mounted and keeps following (no MapLibre resize). Values come from `app/utils/liveStats.ts`; follow mode also runs an in-memory `Recording` (`addFix`, never saved) for elapsed time, instant speed (last 30 s) and average moving speed, which gives the arrival time. "Remaining" values only exist in follow mode (`MODE_FIELDS`). The chosen values per mode and pace vs speed are kept in `localStorage` (`sport-map:live-data`); pace is the default for running routes.
