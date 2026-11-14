---
paths:
  - "app/utils/activityStats.ts"
  - "app/components/profile/ProfileStats.vue"
  - "app/components/profile/ProfileHeader.vue"
  - "app/components/profile/ProfileGoal.vue"
  - "app/components/profile/ProfileRecords.vue"
  - "app/components/profile/ProfileRecordTile.vue"
  - "app/components/profile/ProfileYearSummary.vue"
  - "app/components/profile/ProfileLatestOutings.vue"
  - "app/components/RecordBadge.vue"
  - "app/pages/profile/index.vue"
  - "app/components/route/RouteOutings.vue"
  - "shared/utils/personalRecords.ts"
  - "shared/utils/bestEfforts.ts"
  - "server/utils/recordOutings.ts"
  - "app/utils/yearGoal.ts"
  - "server/utils/profileSummary.ts"
  - "shared/utils/outings.ts"
  - "shared/utils/slopes.ts"
  - "app/components/ElevationProfile.vue"
  - "app/components/map/RouteDisplay.vue"
  - "app/utils/routeLayers.ts"
---

# Profile statistics and slopes

- Profile statistics: computed in the browser from the profile's outings (`MyProfile.outings`: each GPS outing, plus routes only marked as done; see `follow-record.md`) (`app/utils/activityStats.ts`: weeks from Monday, French local dates, last 12 weeks/12 months/5 years), so filters switch instantly; the chart is plain HTML bars (no chart library) in the tracks' rust (`--chart-bar`), the current week, month or year in ink (`--chart-current`, cream in dark mode) with its value written above it, both checked with the dataviz validator on the paper and the surface in both modes (#236), with a screen-reader table (inside an `sr-only` div: an `sr-only` table keeps its width and widens the page). Moving time only exists for GPS-recorded outings.
- Profile layout (#236): the member's own profile has three tabs, kept in `?tab=` (routes, collections; none for the statistics) so coming back from a route shows the same one: Statistiques (first), Parcours (created and done routes, in sub-tabs) and Collections. The statistics tab stacks the year (`ProfileYearSummary`, a `KeyFigures` cartouche), the goal, the chart and the records; on a computer (`lg`) the year and goal take the left column, the chart and records the right one, each in a `profile-panel` (utility in `main.css`), with the latest outings below (`ProfileLatestOutings`, `lg` only, "Record !" on outings that beat a record, `recordBreakers`).
- Profile summary (`ProfileYearSummary`, in the statistics tab of the member's own profile, under `ProfileHeader` on another member's): the current year's distance, outings and gain (French year, `yearSummary`). The member's own profile computes it from `MyProfile.outings`, no extra request. Another member's profile gets it from `/api/profile/:username` (`memberYearSummary`), which reads their outings and marks with the service role, since RLS hides them, keeps only the routes the member can still see, as their own statistics do, and returns only the three totals: never return those rows.
- Year goal (#141, `ProfileGoal`, `app/utils/yearGoal.ts`): distance, gain or outings, every sport or one, kept as the `yearGoal` preference (`preferences.md`: private, on every device, in the export, no migration). It has no year: it applies to the current one and carries on. Only on the member's own profile, in `<ClientOnly>` since preferences are only known in the browser. Drawn as a trail (#236, `goalTrailPath` in `yearGoal.ts`): solid rust as far as the member went, dashed beyond, an ink dot where they stand, a tick for the steady pace and the target on a yellow finish sign; the `progressbar` role is on its wrapper. The steady pace counts today as elapsed (the whole goal expected on 31 December); `goalProgress` is unit-tested. Weekly goals and showing it to the team were left out of the first version.
- Personal records (#140, `ProfileRecords` under the statistics chart, same sport filter, a year (the current one by default) or "Depuis toujours"): longest outing (GPS distance of a recorded outing, the route's for one only marked as done), biggest gain (the route's, like the statistics) and longest moving time, plus best moving times per sport: 1/5/10 km, half and marathon for runners (`SPORT_KINDS` run), 10/20/40 km and the best hour for cyclists, none for hikers (`DISTANCE_EFFORTS`). Ties go to the earliest outing. Tiles set less than 30 days ago wear the yellow `RecordBadge` (`isRecentRecord`), placed after the figures so the link's name starts with the record's label. Each record links to `/routes/:id?tab=outings&outing=<id>`, which opens that outing's detail. `personalRecords` / `recordBreakers` (`shared/utils/personalRecords.ts`) are pure and unit-tested.
- Best efforts (`shared/utils/bestEfforts.ts`, unit-tested with noisy tracks): sliding window over the GPS points' moving time. Against false records: cut at moves during a pause (step without moving time over 20 m) and at jumps (smoothed step faster than 9 m/s running, 25 m/s cycling), positions averaged over 5 points, distances measured between points 25 m apart, steps without moving time cover no distance (drift at a stop). They are a cache in `route_outings.best_efforts` (`{ v, kind, times, hour_m }`): never computed on save, but by `ownRecordedOutings` (`server/utils/recordOutings.ts`, used by `/api/profile/me` and `/api/profile/me/record-breakers`) for the outings with a track whose value is missing, of an older `BEST_EFFORTS_VERSION` or of another sport kind (route sport changed), loading 10 tracks at a time and writing back with the member's session (update policy and grant on that column only). Changing the computation: bump `BEST_EFFORTS_VERSION`.
- "Record !" badge (Passages tab, `RouteOutings`): `GET /api/profile/me/record-breakers`, fetched once the tab shows (it stays mounted behind the others) and again after a deletion, only when the viewer has an outing on the route, silent on failure. An outing gets it when it beat one of the member's records of its sport when recorded (the first outing of a kind beats nothing); only the member sees their badges.
- Slopes (`shared/utils/slopes.ts`): grades over a fixed 200 m, interpolated on the smoothed elevations. Measuring between the nearest points divides elevation model steps by a few meters (95 % on a real route), and 100 m still let artefacts through. Four classes on one warm hue (dataviz ordinal ramp, validated in both themes) colour the map track (MapLibre `line-gradient`, which needs `lineMetrics` on the line source) and the elevation profile, whose tooltip also gives the grade in numbers.
- New colours for data go through the dataviz palette validator, in light and dark mode.
