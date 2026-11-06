---
paths:
  - "app/utils/activityStats.ts"
  - "app/components/ProfileStats.vue"
  - "app/components/ProfileHeader.vue"
  - "app/components/ProfileGoal.vue"
  - "app/utils/yearGoal.ts"
  - "server/utils/profileSummary.ts"
  - "shared/utils/outings.ts"
  - "shared/utils/slopes.ts"
  - "app/components/ElevationProfile.vue"
  - "app/components/map/RouteDisplay.vue"
  - "app/utils/routeLayers.ts"
---

# Profile statistics and slopes

- Profile statistics: computed in the browser from the profile's outings (`MyProfile.outings`: each GPS outing, plus routes only marked as done; see `follow-record.md`) (`app/utils/activityStats.ts`: weeks from Monday, French local dates, last 12 weeks/12 months/5 years), so filters switch instantly; the chart is plain HTML bars (no chart library) in `green-600`, the step that passes the dataviz contrast checks in both themes, with a screen-reader table. Moving time only exists for GPS-recorded outings.
- Profile summary (`ProfileHeader`): the current year's distance, outings and gain (French year, `yearSummary`). The member's own profile computes it from `MyProfile.outings`, no extra request. Another member's profile gets it from `/api/profile/:username` (`memberYearSummary`), which reads their outings and marks with the service role, since RLS hides them, keeps only the routes the member can still see, as their own statistics do, and returns only the three totals: never return those rows.
- Year goal (#141, `ProfileGoal`, `app/utils/yearGoal.ts`): distance, gain or outings, every sport or one, kept as the `yearGoal` preference (`preferences.md`: private, on every device, in the export, no migration). It has no year: it applies to the current one and carries on. Only on the member's own profile, in `<ClientOnly>` since preferences are only known in the browser. The steady pace counts today as elapsed (the whole goal expected on 31 December); `goalProgress` is unit-tested. Weekly goals and showing it to the team were left out of the first version.
- Slopes (`shared/utils/slopes.ts`): grades over a fixed 200 m, interpolated on the smoothed elevations. Measuring between the nearest points divides elevation model steps by a few meters (95 % on a real route), and 100 m still let artefacts through. Four classes on one warm hue (dataviz ordinal ramp, validated in both themes) colour the map track (MapLibre `line-gradient`, which needs `lineMetrics` on the line source) and the elevation profile, whose tooltip also gives the grade in numbers.
- New colours for data go through the dataviz palette validator, in light and dark mode.
