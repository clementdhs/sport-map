---
paths:
  - "shared/utils/osmFilters.ts"
  - "app/components/OsmRouteFilters.vue"
  - "test/unit/osmFilters.test.ts"
  - "app/utils/osmImport.ts"
  - "test/nuxt/osmDiscover.test.ts"
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
- Import ("Importer dans l'éditeur", selected complete route only): `discover.importIntoEditor` resets the editor if it was editing a saved route (a new draft asks for confirmation first, in the page), then `editor.importTrack(osmRouteTrack(route))` (resampled like a GPX, `imported` segment, no elevations: OSM has none, so no D+ until #71), sets the sport from `OSM_KIND_SPORTS`, and fills an empty description with the relation's URL and the ODbL attribution; the name comes from `importTrack` (name, else ref) when empty. Then `/routes/create`.
- Quick filters (#70, `shared/utils/osmFilters.ts`, button `OsmRouteFilters.vue` built like the home page's `SearchFilters`): computed on the loaded routes (`discover.shownRoutes`), no request. The sport filter is the kind tabs (one query per kind, then the tab cache). Distance 0–100 km (100 = no maximum) on the stitched length, optionally counting one-way routes twice. Shape (`osmRouteShape`): `roundtrip` tag first, else start–end ≤ 200 m (as the home page's "Boucles uniquement"), else unknown when the ways don't connect; unknown shapes only show with "Tous". Max difficulty from the relation's `sac_scale` (T1–T3, harder grouped) or `mtb:scale` (S0–S2), reset on kind change (`setKind`): rare on relations, ungraded routes always show. Scope from `network`; routes without one always show. A selected route hidden by a filter is unselected.
- URL: `osmDiscoverQuery` / `parseOsmDiscoverQuery` keep kind, filters and view (`at=lat,lng,zoom`) in the query, only what differs from the defaults. The page rewrites it on each change with `history.replaceState` (also setting vue-router's `history.state.current`, which vue-router writes back to the entry when the page is left), **not** `router.replace`: a navigation at each map move runs the route middleware, and a `navigateTo()` called while a middleware runs is silently dropped by Nuxt (taken for a middleware redirect). That dropped "Importer" whenever a map move ended just before the click (CI failure of 4eb9fbd, reproduced locally with CDP CPU throttling ×6). `route.query` is only read at setup. A URL with a query is applied at setup (`discover.applyState`, before the map mounts); without one (the app's links), the page keeps the store's state and writes it.
- e2e: `fixtures.ts` answers every `**/api/interpreter` (any Overpass instance) with no route; `signed-in.spec.ts` serves the Fontainebleau fixture from maps.mail.ru after a 504 from overpass-api.de, and moves the map with a mocked MapTiler place (the home view, France, is too wide).
- Tests: `test/fixtures/overpass-fontainebleau.json` (also used by the e2e test) holds 4 real relations (closed loop, members out of order, incomplete, sub-relation).
