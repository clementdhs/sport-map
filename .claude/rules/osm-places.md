---
paths:
  - "shared/utils/osmPlaces.ts"
  - "test/unit/osmPlaces.test.ts"
  - "app/composables/useRouteOsmPlaces.ts"
  - "app/components/RouteOsmPlaces.vue"
  - "app/components/OsmPlaceIcon.vue"
  - "app/components/map/OsmPlaces.vue"
  - "server/api/routes/[id]/osm-places.put.ts"
  - "supabase/migrations/*route_osm_places*"
  - "test/e2e/specs/osm-places.spec.ts"
---

# Useful OSM places along a route (#52)

- Drinking water, huts, shelters, parkings, toilets and peaks within `OSM_PLACES_RADIUS_M` = 200 m of the track, found in OpenStreetMap through Overpass **from the browser** (`searchOsmPlaces` in `app/utils/overpass.ts`, same instances, retries and busy error as the discover page, see `osm-discover.md`), not cached in the tab.
- Query (`osmPlacesQuery`): `around:` on the track simplified to ~10 m and coarser until ≤ 800 points (`queryLine`), two `nwr` filters with key regexes, `out center` (areas give their centre). Fountains, taps, wells and springs count as water only with `drinking_water=yes`; `access=private|no|…`, bus and cattle shelters, street-side parking lanes are dropped (`osmPlaceType`). Duplicates (same id, or same type < 20 m apart) keep the named one; beyond `MAX_OSM_PLACES` = 300 the nearest to the track are kept.
- Saved per route in `route_osm_places` (one row, jsonb array, `searched_at`): `PUT /api/routes/:id/osm-places` with the zod-checked list; the route detail embeds it as `osm_places`. It is map data, not the owner's content: **any member who can see the route** may save or refresh it (RLS via the `routes` policy). A change of `routes.geom` deletes the row (security definer trigger), so the next visit of the route page searches again.
- Route page (`useRouteOsmPlaces`): searches once when the route has no saved row and the browser is online, otherwise only on "Mettre à jour". Never one Overpass call per display. After a save, `refreshOfflineRoutePages` re-downloads the pages of a route prepared for offline use, so follow mode offline shows the new places.
- List (`RouteOsmPlaces.vue`): in track order with the km where one passes them and the distance off the track (`placesAlongTrack`, via `snapToTrack`), 8 shown then "Voir les N points". Map: white HTML markers (`OsmPlaceIcon`, distinct from the route's own POIs), mounted before the POI markers so those stay on top; toggled by the `osmPlaces` account preference (on by default), switch "Points utiles (OpenStreetMap)" in the map's "Calques" panel, on the route page and in follow mode.
- ODbL attribution: the list repeats it, and `map/OsmPlaces.vue` adds an empty GeoJSON source carrying `OSM_ATTRIBUTION`, since markers don't feed MapLibre's attribution control.
- e2e: `fixtures.ts` answers Overpass with no element; `osm-places.spec.ts` serves its own answer for its route.
