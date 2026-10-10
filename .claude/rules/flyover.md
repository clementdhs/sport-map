---
paths:
  - "app/utils/flyover.ts"
  - "app/composables/useFlyover.ts"
  - "app/components/FlyoverControls.vue"
  - "app/components/map/RouteDisplay.vue"
  - "app/pages/routes/[id]/index.vue"
---

# 3D flyover (#74)

- "Survol 3D" (route page, beside "Suivre"): the page owns `useFlyover()` (state, animation loop, camera), `RouteDisplay` attaches its map once loaded, `FlyoverControls` floats in `MapSheetLayout`'s `overlay` slot. Pure logic in `app/utils/flyover.ts` (unit-tested): a `FlyoverTrack` maps the flyover's progress to metres along through its `timeline` (metres for a route, moving seconds for an outing: pauses skipped).
- Camera: one `jumpTo` per frame, centre on the moving point (MapLibre keeps it on the ground and raises a camera that would end up inside the relief), pitch 60, bearing towards the direction of travel over ±1 s of flyover, smoothed with a 1 s time constant. Zoom from the ground speed (`flyoverZoom`, ~200 px/s at ×1, zoom 12 to 15); base duration 30 s up to 10 km, 60 s from 50 km.
- The camera's `padding` keeps the point between the top bar, the open sheet and the controls; unlike other moves (`map-sheet.md`) it is passed to `jumpTo`/`easeTo` on purpose, and the stop's `easeTo` restores the padding with the starting view.
- Relief: `MapView force3d` turns the terrain on without touching the saved 2D/3D choice (its 3D button shows pressed and disabled meanwhile). Without an elevation source (no MapTiler key, e2e) the flyover only tilts.
- Touching the map (any move with an `originalEvent`) pauses; playing again glides back to the point first. Reduced motion: the camera keeps the bearing the map had, and MapLibre makes the glides instant. On phones the page collapses the sheet during the flyover (`v-model:snap`) and puts it back afterwards.
- MapTiler quota, measured on 2026-10-10 (fresh browser cache, MapTiler Outdoor, 1280×800): ~710 requests for a 30 km flyover at ×1 (zoom 14), ~650 for 100 km (zoom 12.7), ~550 on a 360 px phone at ×4. The adaptive zoom keeps it roughly flat whatever the length.
- Checking it: the hidden browser pane draws nothing, and headless Chromium with SwiftShader runs the relief at ~1 fps. A separate headless Playwright launched with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` runs it at 60 fps; read the map through `document.querySelector('[data-map-loaded]').__vueParentComponent.setupState.map`.
