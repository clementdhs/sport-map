---
paths:
  - "shared/utils/loops.ts"
  - "server/api/routing/loop.post.ts"
  - "app/stores/loopGenerator.ts"
  - "app/components/LoopGenerator.vue"
  - "app/utils/loopLayers.ts"
---

# Automatic loops (#50)

- `POST /api/routing/loop` (signed-in) gives one proposal: OpenRouteService directions with `options.round_trip` (`length`, `points: 3`, `seed`), 100 km at most (ORS limit). ORS only aims at the length: detours made test loops up to 2.5 times too long around Grenoble, so the endpoint asks again with `nextLoopLength` (scaled by the error, then the secant through the last two tries) until ORS's `summary.distance` is within 10 % (`isOnTarget`), at most `LOOP_ATTEMPTS` = 3 calls, each counted by `consumeRoutingQuota`. Off target after that: 422 `api.loopOffTarget`. On test starts, 8 directions out of 10 converged in the Alps, all in flat country. `points: 5` gave rounder loops but further from the length.
- `useLoopGeneratorStore` sends one request per proposal (`LOOP_PROPOSALS` = 3, consecutive seeds from a random one), in parallel, each row showing its own error; a quota refusal goes through `editor.isRoutingQuotaError` (warns once, like segments). A duration becomes a distance at the sport's speed on the flat (`loopLengthForDuration`, `estimateDurationMin` without gain). Changing the start or the sport clears the proposals; answers for cleared proposals are ignored (`generation`).
- While the panel is open, `RouteEditor.vue` hides the editor's track and its clicks only place the start (`placingStart`) or highlight a proposal; dragging waypoints is off. Proposal colours are the dataviz categorical slots 1–3 (as surfaces); the highlighted loop is drawn last by rebuilding the source (three lines), since a feature state can't change the drawing order.
- Choosing a loop: `editor.loadLoop` cuts it at `loopWaypointIndices` (about every 2 km, 4 to 10 segments) into `snap` segments that keep their slice of elevations and way info: no new routing, and moving a waypoint routes only its two segments. Undo brings back the previous track.
- Repeated "Autres propositions" (up to 9 ORS calls each) can hit ORS's per-minute limit: rows then show `api.routingTooFast`.
- e2e: `fixtures.ts` mocks `/api/routing/loop` with a square of the asked length, turned by the seed.
