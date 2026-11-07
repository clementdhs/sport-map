---
paths:
  - app/pages/routes/[id]/index.vue
  - app/components/RouteOffline.vue
  - app/components/RouteCollections.vue
  - app/components/RouteOutings.vue
  - app/components/map/TrackColouring.vue
---

# Route page layout

Header ("Fait ×N" stamp when the member did it, key figures in the `KeyFigures` cartouche, `theme.md`, then one main action, "Suivre le parcours", over a row of icons with short labels: À faire (adds to or removes from the "À faire" list, `collections.md`; its accessible name says which), Fait, Survol 3D, Plus; #103), then tabs Aperçu / Photos / Avis / Passages. Aperçu reads in the order one prepares an outing: description, weather at the start, elevation profile and slopes, surface and difficulty, points of interest. The open tab is kept in `?tab=` (`photos`, `reviews`, `outings`; none for Aperçu) so reloads and shared links keep it; tabs stay mounted (`unmount-on-hide=false`) so reviews and photos load once. The Photos tab only shows when there are photos or the viewer owns the route, Passages only when someone recorded an outing on it (`RouteOutings`, moving time against the estimate).

Track colours (Aucune / Pente / Surface / Difficulté) are picked on the map, not in Aperçu: `MapTrackColouring`, a "Couleurs du tracé" section of the map's "Calques" panel (#104; `MapView`'s `controls` slot, forwarded by `RouteDisplay`), shown only when the route has more than one choice, with the legend of the colouring picked: every slope class, the surface and difficulty classes found on the route. The page keeps the state, which also colours the elevation profile.

Secondary actions (collection, GPX, offline, edit, delete) are in the "Plus d'actions" menu: `RouteCollections` is only a dialog (`v-model:open`), and `RouteOffline` only shows progress or the stored copy, exposing `prepare` for the menu. e2e tests reach these actions with `routeAction(page, name)` from `test/e2e/fixtures.ts`, and must click a tab before looking for content inside it.
