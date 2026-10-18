---
paths:
  - "server/api/collections/**"
  - "server/utils/collections.ts"
  - "shared/utils/collections.ts"
  - "app/components/RouteCollections.vue"
  - "app/components/map/RouteCollection.vue"
  - "app/pages/collections/**"
  - "app/pages/profile/index.vue"
  - "server/utils/activity.ts"
---

# Collections

`collections` and `collection_routes`: named groups of routes, private or public (shared by link, `/collections/:id`). RLS checks both sides: a link is only visible when the collection and the route both are, so a public collection never reveals a private route, and one can only add routes one can see. Deleting a route cascades to its links. The collection map draws simplified tracks from the `route_preview` computed field (`ST_Simplify`), not the full geometries.

## "À faire" list (#129)

Each member has a fixed, private "À faire" list (to do), stored as `route_activity` rows of type `saved` (the former "Sauvegardés" tab, renamed in the interface only; the account export keeps the `saved` type). It comes first in the profile's Collections tab and opens on `/collections/todo`: `GET /api/collections/todo` returns a `CollectionDetail` with `todo: true` and no name, date or description, which the collection page fills from `todo.*` and shows without editing, sharing or deleting; removing a route there calls `DELETE /api/routes/:id/activity/saved`. A route leaves the list once done: `PUT …/activity/completed` and `POST …/outings` call `removeFromTodo`, and the route page updates its button; undoing "Je l'ai fait" doesn't put it back.
