---
paths:
  - app/pages/routes/[id]/index.vue
  - app/components/RouteOffline.vue
  - app/components/RouteCollections.vue
  - app/components/RouteOutings.vue
  - app/components/map/TrackColouring.vue
---

# Route page layout

Header (key figures, then one main action, "Suivre le parcours", over a row of icons with short labels: Sauvegarder, Fait, Survol 3D, Plus; #103), then tabs Aperçu / Photos / Avis / Passages. Aperçu reads in the order one prepares an outing: description, weather at the start, elevation profile and slopes, surface and difficulty, points of interest. The open tab is kept in `?tab=` (`photos`, `reviews`, `outings`; none for Aperçu) so reloads and shared links keep it; tabs stay mounted (`unmount-on-hide=false`) so reviews and photos load once. The Photos tab only shows when there are photos or the viewer owns the route, Passages only when someone recorded an outing on it (`RouteOutings`, moving time against the estimate).

Track colours (Aucune / Pente / Surface / Difficulté) are picked on the map, not in Aperçu: `MapTrackColouring`, a "Couleurs du tracé" button that the page puts in `MapView`'s control group (its `controls` slot, forwarded by `RouteDisplay`), shown only when the route has more than one choice. It opens a popover (on phones too, so the map stays in view) that stays open while the map is moved, with the legend of the colouring picked: every slope class, the surface and difficulty classes found on the route. The page keeps the state, which also colours the elevation profile. #104 will move this button into the "Calques" panel.

Secondary actions (collection, GPX, offline, edit, delete) are in the "Plus d'actions" menu: `RouteCollections` is only a dialog (`v-model:open`), and `RouteOffline` only shows progress or the stored copy, exposing `prepare` for the menu. e2e tests reach these actions with `routeAction(page, name)` from `test/e2e/fixtures.ts`, and must click a tab before looking for content inside it.
