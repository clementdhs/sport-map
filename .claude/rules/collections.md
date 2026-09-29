---
paths:
  - "server/api/collections/**"
  - "server/utils/collections.ts"
  - "shared/utils/collections.ts"
  - "app/components/RouteCollections.vue"
  - "app/components/map/RouteCollection.vue"
  - "app/pages/collections/**"
---

# Collections

`collections` and `collection_routes`: named groups of routes, private or public (shared by link, `/collections/:id`). RLS checks both sides: a link is only visible when the collection and the route both are, so a public collection never reveals a private route, and one can only add routes one can see. Deleting a route cascades to its links. The collection map draws simplified tracks from the `route_preview` computed field (`ST_Simplify`), not the full geometries.
