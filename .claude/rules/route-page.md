---
paths:
  - app/pages/routes/[id]/index.vue
  - app/components/RouteOffline.vue
  - app/components/RouteCollections.vue
  - app/components/RouteOutings.vue
  - app/components/map/TrackColouring.vue
  - app/components/RouteSteps.vue
  - app/components/RouteTeamWords.vue
  - app/components/RouteActionButton.vue
  - app/utils/routeSteps.ts
---

# Route page layout

Header in the topo look (#233, canvas boards "Fiche parcours"): the sport in small capitals with its `SportMark` and "· Boucle" (`is_loop`), the name as a Barlow Condensed `h1` (also in the sheet's header on phones, for the collapsed sheet), the owner's avatar, name, rating (a link to the Avis tab) and date, the "Fait ×N" stamp (`lg`) on the paper when the member did it, key figures in the `KeyFigures` cartouche (distance, D+, the duration on the yellow, high point = highest elevation of the profile; `theme.md`), then one main action, "Suivre le parcours", over a row of round icon plates with short labels (`RouteActionButton`, ink with a yellow icon when active): À faire (adds to or removes from the "À faire" list, `collections.md`; its accessible name says which), Fait, Survol 3D, Plus; #103. Then tabs Aperçu / Photos / Avis / Passages. Aperçu reads in the order one prepares an outing: description, weather at the start, elevation profile and slopes, steps, the team's words, surface and difficulty, useful OSM places. The side panel opens at 440 px (`SIDE_PANEL_WIDTH.default`, every map page).

- **Steps** (`RouteSteps`, Clem's choice): the author's points of interest (`pois`, type + optional note) in track order (`routeSteps`, `app/utils/routeSteps.ts`), as signs on a post: number, note (else the type, the type under a note), km and passing time, then the arrival ("Retour au départ" for a loop) on the yellow with the total distance and duration. Passing times use `useDurationEstimate` (the member's pace) with the climbing done by then: the profile's raw positive differences scaled so they end on the stored `elevation_gain_m` (the last step's time is the cartouche's), spread along the distance without a profile. The same numbers mark the profile (`steps` of `ElevationProfile`, ink squares, hidden from screen readers) and the map (`MapPoiMarkers` `numbered`, ink squares whose label says "Étape N · type — note"); the editor keeps its coloured POI circles.
- **Team's words** (`RouteTeamWords`): the two latest reviews with a comment, not hidden, with an author, as quotes (author, stars, date), "Tous les avis" beyond. Same explicit `useFetch` key as `RouteReviews` (`routeReviewsKey`: the automatic key includes the call site, so the same URL alone isn't shared), so one request and the Avis tab's edits show at once (moderating hides the quote).

The open tab is kept in `?tab=` (`photos`, `reviews`, `outings`; none for Aperçu) so reloads and shared links keep it; tabs stay mounted (`unmount-on-hide=false`) so reviews and photos load once. The Photos tab only shows when there are photos or the viewer owns the route, Passages only when someone recorded an outing on it (`RouteOutings`, moving time against the estimate).

Track colours (Aucune / Pente / Surface / Difficulté) are picked on the map, not in Aperçu: `MapTrackColouring`, a "Couleurs du tracé" section of the map's "Calques" panel (#104; `MapView`'s `controls` slot, forwarded by `RouteDisplay`), shown only when the route has more than one choice, with the legend of the colouring picked: every slope class, the surface and difficulty classes found on the route. The page keeps the state, which also colours the elevation profile.

Secondary actions (collection, GPX, offline, edit, delete) are in the "Plus d'actions" menu: `RouteCollections` is only a dialog (`v-model:open`), and `RouteOffline` only shows progress or the stored copy, exposing `prepare` for the menu. e2e tests reach these actions with `routeAction(page, name)` from `test/e2e/fixtures.ts`, and must click a tab before looking for content inside it.
