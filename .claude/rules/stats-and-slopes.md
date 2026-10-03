---
paths:
  - "app/utils/activityStats.ts"
  - "app/components/ProfileStats.vue"
  - "shared/utils/slopes.ts"
  - "app/components/ElevationProfile.vue"
  - "app/components/map/RouteDisplay.vue"
  - "app/utils/routeLayers.ts"
---

# Profile statistics and slopes

- Profile statistics: computed in the browser from the profile's outings (`MyProfile.outings`: each GPS outing, plus routes only marked as done; see `follow-record.md`) (`app/utils/activityStats.ts`: weeks from Monday, French local dates, last 12 weeks/12 months/5 years), so filters switch instantly; the chart is plain HTML bars (no chart library) in `green-600`, the step that passes the dataviz contrast checks in both themes, with a screen-reader table. Moving time only exists for GPS-recorded outings.
- Slopes (`shared/utils/slopes.ts`): grades over a fixed 200 m, interpolated on the smoothed elevations. Measuring between the nearest points divides elevation model steps by a few meters (95 % on a real route), and 100 m still let artefacts through. Four classes on one warm hue (dataviz ordinal ramp, validated in both themes) colour the map track (MapLibre `line-gradient`, which needs `lineMetrics` on the line source) and the elevation profile, whose tooltip also gives the grade in numbers.
- New colours for data go through the dataviz palette validator, in light and dark mode.
