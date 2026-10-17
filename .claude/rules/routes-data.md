---
paths:
  - "server/api/routes/**"
  - "server/api/routing/**"
  - "server/utils/openrouteservice.ts"
  - "server/utils/route*.ts"
  - "server/utils/geo.ts"
  - "shared/utils/routes.ts"
  - "app/stores/routeEditor.ts"
  - "app/stores/routeSearch.ts"
  - "app/components/SearchBox.vue"
  - "supabase/migrations/*search*"
  - "app/components/RouteEditorWorkspace.vue"
  - "app/components/map/RouteEditor.vue"
  - "app/components/map/PoiMarkers.vue"
---

# Route data and editor

- Geometry is stored as `geography(…, 4326)`, inserted as EWKT (`SRID=4326;LINESTRING(...)`); `start_point` and `distance_m` on `routes` are generated columns. Read the track as GeoJSON with the `route_geojson` computed field.
- `routes.editor_state` stores how the editor built the track (waypoints, and each segment's mode and `start`/`end` index range in the saved track) so a route can be edited again without duplicating coordinates. Routes saved before it exist load as a single `locked` segment.
- `routes.pois` holds the route's points of interest (`[{ type, coordinates, note? }]`, validated by `poiSchema`), saved with the route so they share its visibility. They are snapped onto the track when placed; on the map they are HTML markers (`MapPoiMarkers`) whose content is teleported so it can use Nuxt UI icons.
- Search (`search_routes`): two `union all` branches guarded by `text_query is null` / `is not null`, so each keeps its index (GiST on the view, trigrams on the text). Text search matches every word, normalized by `public.search_text` (lowercase, no accents, punctuation as spaces); to use the partial trigram index, a query must repeat its exact expression `public.search_text(name || ' ' || coalesce(description, ''))` and filter on `is_public`.
- Home search box (`SearchBox.vue`): one `UInputMenu` with a "Parcours contenant …" suggestion first (fixed, so Enter never jumps when places load) then MapTiler places. Picking a place clears the name search. Its clear control is our own `UButton` beside the menu: Nuxt UI's `clear` renders a non-focusable span. e2e runs without a MapTiler key, so places are only checked by hand.
- Routing quota: `/api/routing/segment` and `/api/routing/loop` (signed-in only, automatic loops in `loops.md`) call `consumeRoutingQuota` (`consume_routing_quota`) before each OpenRouteService call, which counts per user and Paris day in `routing_usage` (atomic; `NUXT_ROUTING_DAILY_LIMIT`, 300 by default, 3 in e2e tests). Past the limit it answers 429 with `data.reason = ROUTING_QUOTA_REASON`; the editor then warns once and draws new segments as straight lines without calling the API again. A 429 without that reason is OpenRouteService's own per-minute limit.
- Route lists select `ROUTE_LIST_COLUMNS` and map rows with `toRouteListItem` (`server/utils/routeList.ts`).
- Sports (`SPORT_TYPES`): `running` means road running and `cycling` leisure cycling, values kept from before trail, road cycling and mountain biking existed (#49), so no route needed migrating. Each sport has an OpenRouteService profile (`ROUTING_PROFILES`, shared), a duration formula (`estimateDurationMin`, explained by `duration.methods.*`), an icon and a kind (`SPORT_KINDS`: runners get a pace by default, cyclists a speed). A new sport is added with `alter type public.sport_type add value`, pushed to the hosted DB before the code.
- Editor sport (#105): chosen at the top of the panel, before tracing. Each snapped segment remembers the profile it was routed with (`Segment.profile`; a reloaded route's snapped segments get its sport's profile). Changing the sport never reroutes by itself (routing quota): new segments use the new sport, and `outdatedSegmentCount` (snapped segments whose profile differs, so trail ↔ hiking counts none) shows an alert whose button calls `rerouteForSport()`, undoable, which keeps each old track until its new one arrives.
