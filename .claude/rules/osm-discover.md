---
paths:
  - "shared/utils/osmRoutes.ts"
  - "app/utils/overpass.ts"
  - "app/utils/osmRouteLayers.ts"
  - "app/stores/osmDiscover.ts"
  - "app/pages/discover.vue"
  - "app/components/map/OsmRoutes.vue"
  - "test/unit/osmRoutes.test.ts"
  - "test/unit/overpass.test.ts"
---

# OSM marked routes (#69, page /discover)

- Overpass is queried **from the browser** (`app/utils/overpass.ts`), not by a server route as the issue first said: it allows 2 queries at a time per IP address, and Vercel functions share theirs with other sites. CORS is open and answers are gzipped; a form body (`data=`) keeps it a simple request without preflight. Decision recorded in a comment on #69.
- Overpass is often busy: a busy instance answers 504 after a few seconds, then often answers the same query in two. `OVERPASS_URLS` (overpass-api.de, then maps.mail.ru) are each tried twice, in turn, within 60 s. A 200 whose `remark` contains "error" (query stopped by its timeout) is incomplete: treated as a failure. All failed: `LocalizedError('errors.overpassBusy')`. A newer search aborts the running one (`AbortController`). Results are cached in the tab for 15 min, keyed by kind + rounded area.
- The area is the view rounded outwards to 0.01° (`osmSearchBbox`, so close views share the cache) and at most `OSM_SEARCH_MAX_KM2` = 600 km²: beyond that the page says "Zoome pour chercher". Fontainebleau (~100 km², 56 walking relations): 2.2 MB raw, ~300 KB gzipped, 2 to 15 s.
- Kinds: `foot` = `route=hiking|foot` (trail running has no route type in OSM), `bicycle`, `mtb`; `OSM_KIND_SPORTS` gives the app sport for icons and import.
- Stitching (`stitchWays`): ways chained in member order and turned as needed (an out-and-back may use a way twice), then the pieces joined nearest ends first when ≤ `MAX_GAP_M` = 30 m apart (members out of order, small mapping gaps). Roles `alternative`, `excursion`, `approach`, `connection`… and sub-relations are ignored. Anything left apart → `complete: false`, drawn dashed, badge "Incomplet", not importable. In Fontainebleau 36 relations of 56 are complete; the others turn in the middle of a way or branch. Lines are simplified (~1 m) and rounded to 6 decimals.
- Page: searches when it opens (first view of the map, unless results already cover it) and when the kind changes (old results cleared at once); otherwise only with "Chercher dans cette zone", shown when the view isn't covered by the last search. Overpass is too slow and limited to search on every move. Entry points: home panel link and the empty editor's button; both call `discover.startFrom(view)` so the page opens on their map view. The store keeps view and results when coming back from the editor.
- List order (`sortOsmRoutes`): complete first, then local → international (`network` lwn/rwn/nwn/iwn, lcn…), then name with numbers in order; unnamed ("Parcours sans nom") last. Map: all routes in dataviz blue, the hovered or selected one redrawn on top in `ROUTE_COLOR` (layer filter, no data rebuild). The source carries the OSM attribution (ODbL) whatever the basemap; the panel repeats it.
- Tests: `test/unit/fixtures/overpass-fontainebleau.json` holds 4 real relations (closed loop, members out of order, incomplete, sub-relation).
