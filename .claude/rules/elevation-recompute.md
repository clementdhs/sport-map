---
paths:
  - "scripts/recompute-route-elevations.ts"
  - "scripts/routeElevations.ts"
  - "shared/utils/trackElevation.ts"
  - "server/utils/elevation.ts"
---

# Recomputing saved routes' elevations (#177)

One-off script, run by hand from a checkout, that measures saved routes again with the IGN (Open-Meteo abroad) as routed tracks are since #176, then rewrites `elevation_profile`, `elevation_gain_m` and `elevation_loss_m` (`elevationStats`, as `routeRowFromPayload` does). Nothing else derived from elevations is stored: slopes, durations, stats and the link preview are computed when shown (the preview's cache key is `updated_at`, which the routes trigger bumps on each update).

```bash
npx jiti scripts/recompute-route-elevations.ts
```

- Local Supabase by default (`npx supabase status`), report only; `--apply` saves. `--hosted` uses `.env` (`NUXT_PUBLIC_SUPABASE_URL`, `NUXT_SUPABASE_SECRET_KEY`): Clem's go only, and only once #176 is in production, otherwise routes drawn in between still get OpenRouteService's elevations. Run `--hosted` without `--apply` first to read the report.
- Which points (`routedRanges`, `scripts/routeElevations.ts`): the whole track of `drawn` routes (locked segments included: drawn before the editor state existed). `gpx_import` (GPX files, and OSM routes imported from Discover, whose elevations already come from the IGN) and `recorded` routes keep that source when segments are added in the editor: only their `snap`/`straight` segments are measured again, without the junction points they share with the file's or the recording's points. Without an editor state, or without stored elevations, they are left as they are.
- Limits: IGN requests 250 ms apart (5 a second per IP), one retry after a 429; Open-Meteo paced at 100 ms per point (600 a minute) and stopped at 8,000 points a run (10,000 a day, the app's own imports included): routes past that fail with a message and are picked up by the next day's run.
- A route that fails is listed at the end and the others go on. Running it again rewrites only what still differs (idempotent), but still asks the IGN for every route.
- The script keeps its own copies of the IGN and Open-Meteo requests (`server/utils/elevation.ts` needs a Nitro event): change both together.
