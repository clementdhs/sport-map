---
paths:
  - "shared/utils/loops.ts"
  - "server/api/routing/loop.post.ts"
  - "app/stores/loopGenerator.ts"
  - "app/components/LoopGenerator.vue"
  - "app/utils/loopLayers.ts"
  - "app/utils/createMode.ts"
  - "app/components/RouteEditorWorkspace.vue"
---

# Automatic loops (#50)

- `POST /api/routing/loop` (signed-in) gives one proposal: OpenRouteService directions with `options.round_trip` (`length`, `points: 3`, `seed`), 100 km at most (ORS limit). ORS only aims at the length: detours made test loops up to 2.5 times too long around Grenoble, so the endpoint asks again with `nextLoopLength` (scaled by the error, then the secant through the last two tries) until ORS's `summary.distance` is within 10 % (`isOnTarget`), at most `LOOP_ATTEMPTS` = 3 calls, each counted by `consumeRoutingQuota`. Off target after that: 422 `api.loopOffTarget`. On test starts, 8 directions out of 10 converged in the Alps, all in flat country. `points: 5` gave rounder loops but further from the length.
- Elevations (#176): only the accepted loop is sent to the IGN (Open-Meteo abroad) by `withMeasuredElevations`, after the tries; rejected tries never call it, and it doesn't count in the quota. When those services fail or are slow, the loop keeps ORS's elevations, whose 0 m are filled first (`withoutZeroElevations`). See "Routed elevations" in `routes-data.md`.
- `useLoopGeneratorStore` sends one request per proposal (`LOOP_PROPOSALS` = 3, consecutive seeds from a random one), in parallel, each row showing its own error; a quota refusal goes through `editor.isRoutingQuotaError` (warns once, like segments). A duration becomes a distance on the flat at the member's pace, else the sport's default (`loopLengthForDuration`, `estimateDurationMin` without gain, `paces.md`). Changing the start or the sport clears the proposals; answers for cleared proposals are ignored (`generation`).
- One "Créer" panel (#215): `RouteEditorWorkspace` opens with a mode bar (`UTabs`, "Boucle" / "À la main"; `loop.open` is the mode). The create page (`remember-mode`) opens in the mode of `?mode=loop|manual`, else the last one picked on the device (`app/utils/createMode.ts`, `sport-map:create-mode`, read on mount, ignored when a draft has a track, e.g. one imported from the marked routes), and writes each change back with `router.replace`; the edit page always opens by hand. The start is shared: `show()` takes the track's first point when there is one, `switchToManual()` makes the loop's start the first waypoint of an empty track, `leave()` (unmount) forgets it so a saved route doesn't lend its start to the next. "Clique sur la carte pour placer le départ." is said once, in the layout's `overlay` slot (`role="status"`, with "Annuler" when a loop start already exists); "Importer un fichier GPX" sits at the bottom of the panel in both modes, and an import switches to drawing by hand. "Aller-retour" waits for #214.
- While the panel is open, `RouteEditor.vue` hides the editor's track and its clicks only place the start (`placingStart`) or highlight a proposal; dragging waypoints is off. Proposal colours are the dataviz categorical slots 1–3 (as surfaces); the highlighted loop is drawn last by rebuilding the source (three lines), since a feature state can't change the drawing order.
- Choosing a loop: `editor.loadLoop` cuts it at `loopWaypointIndices` (about every 2 km, 4 to 10 segments) into `snap` segments that keep their slice of elevations and way info: no new routing, and moving a waypoint routes only its two segments. Undo brings back the previous track.
- Repeated "Autres propositions" (up to 9 ORS calls each) can hit ORS's per-minute limit: rows then show `api.routingTooFast`.
- e2e: `fixtures.ts` mocks `/api/routing/loop` with a square of the asked length, turned by the seed.
