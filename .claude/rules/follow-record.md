---
paths:
  - "app/pages/routes/*/follow.vue"
  - "app/pages/record.vue"
  - "app/components/map/RouteFollow.vue"
  - "app/utils/trackFollower.ts"
  - "app/utils/recorder.ts"
  - "app/utils/liveStats.ts"
  - "app/utils/heading.ts"
  - "app/components/LiveData.vue"
  - "app/utils/voiceGuide.ts"
  - "app/utils/speech.ts"
  - "app/components/VoiceGuideSettings.vue"
  - "app/composables/**"
  - "server/api/recordings.post.ts"
  - "server/api/routes/*/outings*"
  - "app/components/RouteOutings.vue"
  - "app/components/OutingDetail.vue"
  - "app/components/OutingChart.vue"
  - "app/utils/splits.ts"
  - "shared/utils/outings.ts"
---

# Follow mode and outing recording

- Follow mode (`/routes/:id/follow`, no layout): `useWatchPosition` feeds `locateOnTrack` (`app/utils/trackFollower.ts`), which snaps each GPS fix to the track in a local flat frame and, where the track passes twice (loops, out-and-backs), keeps the passage closest to the previous progress. The screen is kept on with `useScreenWakeLock`. e2e tests drive it with Playwright's `geolocation` / `setGeolocation`.
- Outing recording (`/record`, no layout): pure functions in `app/utils/recorder.ts` over a serializable `Recording` (fix filtering, distance, moving time, pauses, GPS gaps), saved to `localStorage` after every point so an outing survives a closed page. `POST /api/recordings` stores the track as a route (`source: 'recorded'`), a `completed` `route_activity` with `started_at`, `duration_s`, `moving_s`, and its first `route_outings` row. A browser only records with the screen on; the Android app records with the screen off (`.claude/rules/android.md`). e2e tests drive it with `page.clock` and `setGeolocation`.
- Recording while following ("Enregistrer la sortie" in follow mode): same `useOutingRecorder` as `/record` (draft in `localStorage`, one key per route: `sport-map:recording:<id>`, leave guards), next to the in-memory `Recording` the guidance uses. `POST /api/routes/:id/outings` adds a `route_outings` row (times, GPS distance and GPS points; the route keeps its own track) and upserts the `completed` activity with this latest outing's times; no route is created. `unique (user_id, route_id, started_at)` makes a save sent again a success, not a second outing. Saving offline fails and keeps the draft for later.
- Outings (`route_outings`): every GPS outing on a route, by anyone who can see it, listed in the route page's Passages tab (moving time against `estimateDurationMin`, gap rounded to 5 min). Profile statistics count each outing, plus once each route only marked as done without any outing (`statsOutings`), with the route's distance and gain.
- Outing detail (#57): both saves send `track`, the outing's GPS points as `[lng, lat, altitude | null, elapsed s, moving s so far]` (`outingTrack()`, thinned past `MAX_OUTING_POINTS`), stored in `route_outings.track` (`has_track` is generated, so lists don't load tracks). Each `RecordedPoint` keeps `movingMs`, the moving time when it was added: pauses and stops are left out of splits and speeds simply because it doesn't grow during them. Drafts recorded before have no `movingMs` and are saved without a track; outings saved before #57 have none either and show no "Détail". The Passages tab loads a track only when its detail opens (`GET /api/routes/:id/outings/:outingId`); `app/utils/splits.ts` (pure, unit-tested) gives splits per km (last stretch under 50 m left out, D+/D− from the GPS altitudes with the routes' smoothing, none without altitudes) and speed over 200 m of track around each of 200 samples. `OutingChart` plots pace linearly (s/km, faster up) for runners and walkers, km/h for cyclists (`SPORT_KINDS`), over the elevation in a neutral grey, bounds clipped to the 2nd–98th percentiles; hovering it moves the route page's map marker to the outing's own position.
- Data screen (`LiveData.vue`, "Données" button of both pages): big values over the map, which stays mounted and keeps following (no MapLibre resize). Values come from `app/utils/liveStats.ts`; follow mode also runs an in-memory `Recording` (`addFix`, never saved) for elapsed time, instant speed (last 30 s) and average moving speed, which gives the arrival time. "Remaining" values only exist in follow mode (`MODE_FIELDS`). The chosen values per mode and pace vs speed are kept in `localStorage` (`sport-map:live-data`); pace is the default for running routes.
- Voice guidance (follow mode only): `app/utils/voiceGuide.ts` decides what to announce from each fix (pure, unit-tested), `useVoiceGuide` turns it into sentences in the interface's language and filters by the choices kept in `localStorage` (`sport-map:voice`, off by default). Every announcement is computed even when not chosen, so turning one on mid-outing doesn't bring back old news. Kilometres count the GPS distance actually covered (the in-memory `Recording`), not the progress along the route; climbs come from `climbs()` (`shared/utils/slopes.ts`) averaging at least 3 %, announced 300 m ahead. Leaving the route again within a minute of an announcement stays silent (GPS swinging around the limit).
- Speech (`app/utils/speech.ts`): `speechSynthesis` in browsers, which only speaks after a user action, so turning the guidance on speaks a confirmation. Android's WebView has no `speechSynthesis`: the app uses `@capacitor-community/text-to-speech`, which keeps speaking with the screen off since the GPS foreground service keeps the page running. e2e tests replace `speechSynthesis.speak` in an init script and read what was said.
- GPS arrow (`RouteFollow.vue`, both pages): the position is an arrow pointing the direction of travel, a dot while it's unknown, always with the accuracy halo. `app/utils/heading.ts` (pure, unit-tested) takes the device's course (`coords.heading` in browsers, `bearing` in the Android plugin) only at 0.5 m/s or more, otherwise measures it between fixes at least 10 m (or the accuracy) apart, ignoring fixes worse than 35 m and jumps. Stopped, the last arrow stays frozen and turns back into a dot after 2 min without a new direction: chosen before the field test, the thresholds may change after it. Phone compass and heading-up map are out of scope (#65).
- Live location sharing with the family ("Partager ma position", both pages, `useLiveShare` + `LiveShareControl`): `.claude/rules/live-sharing.md`.
