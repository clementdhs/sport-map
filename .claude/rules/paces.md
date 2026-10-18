---
paths:
  - "shared/utils/pace.ts"
  - "shared/utils/routes.ts"
  - "app/components/PaceSettings.vue"
  - "app/components/DurationEstimate.vue"
  - "app/composables/useDurationEstimate.ts"
  - "server/api/profile/me/pace-suggestions.get.ts"
  - "test/e2e/specs/paces.spec.ts"
---

# Pace per sport (#146)

- `estimateDurationMin(sport, distance, gain, pace?)` takes a pace on the flat in min/km for every sport (`DEFAULT_PACES` when none). Climbing stays: km-effort at the same pace for runners, a fixed hour per 500 or 600 m for the others whatever their speed. Without a setting the durations are those from before #146 (the hand-checked values of `routes.test.ts`).
- The setting is the account preference `paces` (`preferences.md`): min/km per sport whatever the sport, a sport left out keeping its default. It is typed and shown as a pace (`5:30`) for runners (`SPORT_KINDS` run) and as a speed (`4,5` km/h, the language's decimals) for the others, within `PACE_SETTING_LIMITS`; `parseSportPaces` drops anything out of them.
- Every estimate the member sees uses their pace through `useDurationEstimate()` (cards, Passages tab, loop generator) or `usePreference('paces')` (`DurationEstimate`, whose tooltip then says "Ta vitesse de …"); the loop store reads `usePreferencesStore()`. The link preview image (`ogImage.ts`) keeps the defaults: nobody is looking.
- "Calculer depuis mes sorties": `GET /api/profile/me/pace-suggestions` reads the member's 200 latest outings and `suggestPaces` keeps, per sport, the 10 latest with GPS points (`has_track`, #57), at least 1 km and 5 min, and a pace a member could set. Each gives the flat pace that makes `estimateDurationMin` find its moving time again (`flatPaceMinPerKm`), counting the route's gain in proportion to the distance covered (GPS altitudes are too noisy). The median is rounded as typed (5 s, 0.1 km/h) and only saved when the member clicks "Utiliser".
