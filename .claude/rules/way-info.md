---
paths:
  - "shared/utils/wayInfo.ts"
  - "app/components/RouteBreakdown.vue"
  - "server/utils/openrouteservice.ts"
  - "server/api/routing/**"
  - "app/stores/routeEditor.ts"
---

# Surface and trail difficulty (#43)

- `routes.way_info` stores OpenRouteService's extra info (`surface`, `waytype`, `traildifficulty`), requested with every snapped segment (no extra ORS call), as `[start, end, value]` ranges of point indices; consecutive ranges share their boundary point. Trail difficulty is filed as `sac_scale` (walking profiles, T1–T6) or `mtb_scale` (cycling profiles, S0–S6) from the profile that routed the segment, and the route page shows the scale of the route's sport.
- In the editor each segment keeps its own ranges (`Segment.wayInfo`, indexed in its points): `track.wayInfo` shifts them by the segment's `start` and merges a value that goes on across a junction (`joinWayInfo`); `loadRoute` slices the saved ranges back per segment, out-and-back reverses them. Straight, imported and locked segments have none, so GPX imports, recordings and older routes show nothing rather than a guess.
- Classes (`surfaceClass`): a known surface wins (paved, or loose: trail on paths/footways/steps, dirt road elsewhere); without one, roads count as paved, paths as trails, tracks as dirt roads, the rest as unknown. Difficulty grades are grouped in four classes (T4+ and S3+ together) plus "not graded"; the difficulty block only shows when some way is graded.
- Colours: surface uses categorical slots 1–3 of the dataviz palette, difficulty a blue ordinal ramp, both validated on the light and dark surfaces; gray means unknown. The route page's "Couleurs du tracé" radio group picks one colouring at a time (slopes also colour the elevation profile); the breakdowns' legends give names and percentages, so they read without the colours.
- `pathShare` (#295): the share of a track's length in the unpaved and trail classes, unknown ways counting as not paths; it ranks generated loops when paths are preferred (`loops.md`).
