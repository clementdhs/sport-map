---
paths:
  - "server/api/routes/**"
  - "server/utils/route*.ts"
  - "server/utils/geo.ts"
  - "shared/utils/routes.ts"
  - "app/stores/routeEditor.ts"
  - "app/stores/routeSearch.ts"
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
- Route lists select `ROUTE_LIST_COLUMNS` and map rows with `toRouteListItem` (`server/utils/routeList.ts`).
