---
paths:
  - app/pages/routes/[id]/index.vue
  - app/components/RouteOffline.vue
  - app/components/RouteCollections.vue
---

# Route page layout

Header (key figures, Suivre, Sauvegarder, Je l'ai fait), then tabs Aperçu / Photos / Avis. The open tab is kept in `?tab=` (`photos`, `reviews`; none for Aperçu) so reloads and shared links keep it; tabs stay mounted (`unmount-on-hide=false`) so reviews and photos load once. The Photos tab only shows when there are photos or the viewer owns the route.

Secondary actions (collection, GPX, offline, edit, delete) are in the "Plus d'actions" menu: `RouteCollections` is only a dialog (`v-model:open`), and `RouteOffline` only shows progress or the stored copy, exposing `prepare` for the menu. e2e tests reach these actions with `routeAction(page, name)` from `test/e2e/fixtures.ts`, and must click a tab before looking for content inside it.
