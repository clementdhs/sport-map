---
paths:
  - "app/pages/routes/*/follow.vue"
  - "app/pages/record.vue"
  - "app/components/map/RouteFollow.vue"
  - "app/utils/trackFollower.ts"
  - "app/utils/recorder.ts"
  - "app/utils/liveStats.ts"
  - "app/components/LiveData.vue"
  - "app/utils/voiceGuide.ts"
  - "app/utils/speech.ts"
  - "app/components/VoiceGuideSettings.vue"
  - "app/composables/**"
  - "server/api/recordings.post.ts"
---

# Follow mode and outing recording

- Follow mode (`/routes/:id/follow`, no layout): `useWatchPosition` feeds `locateOnTrack` (`app/utils/trackFollower.ts`), which snaps each GPS fix to the track in a local flat frame and, where the track passes twice (loops, out-and-backs), keeps the passage closest to the previous progress. The screen is kept on with `useScreenWakeLock`. e2e tests drive it with Playwright's `geolocation` / `setGeolocation`.
- Outing recording (`/record`, no layout): pure functions in `app/utils/recorder.ts` over a serializable `Recording` (fix filtering, distance, moving time, pauses, GPS gaps), saved to `localStorage` after every point so an outing survives a closed page. `POST /api/recordings` stores the track as a route (`source: 'recorded'`) and a `completed` `route_activity` with `started_at`, `duration_s`, `moving_s`. A browser only records with the screen on; the Android app records with the screen off (`.claude/rules/android.md`). e2e tests drive it with `page.clock` and `setGeolocation`.
- Data screen (`LiveData.vue`, "Données" button of both pages): big values over the map, which stays mounted and keeps following (no MapLibre resize). Values come from `app/utils/liveStats.ts`; follow mode also runs an in-memory `Recording` (`addFix`, never saved) for elapsed time, instant speed (last 30 s) and average moving speed, which gives the arrival time. "Remaining" values only exist in follow mode (`MODE_FIELDS`). The chosen values per mode and pace vs speed are kept in `localStorage` (`sport-map:live-data`); pace is the default for running routes.
- Voice guidance (follow mode only): `app/utils/voiceGuide.ts` decides what to announce from each fix (pure, unit-tested), `useVoiceGuide` turns it into sentences in the interface's language and filters by the choices kept in `localStorage` (`sport-map:voice`, off by default). Every announcement is computed even when not chosen, so turning one on mid-outing doesn't bring back old news. Kilometres count the GPS distance actually covered (the in-memory `Recording`), not the progress along the route; climbs come from `climbs()` (`shared/utils/slopes.ts`) averaging at least 3 %, announced 300 m ahead. Leaving the route again within a minute of an announcement stays silent (GPS swinging around the limit).
- Speech (`app/utils/speech.ts`): `speechSynthesis` in browsers, which only speaks after a user action, so turning the guidance on speaks a confirmation. Android's WebView has no `speechSynthesis`: the app uses `@capacitor-community/text-to-speech`, which keeps speaking with the screen off since the GPS foreground service keeps the page running. e2e tests replace `speechSynthesis.speak` in an init script and read what was said.
