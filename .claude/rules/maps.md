---
paths:
  - "app/components/map/**"
  - "app/utils/routeLayers.ts"
  - "app/utils/mapStyle.ts"
  - "app/utils/basemaps.ts"
  - "app/utils/mapTerrain.ts"
  - "app/utils/mapViewState.ts"
---

# Maps (MapLibre)

- MapLibre is imported only client-side (dynamic import in `onMounted`), and its worker URL is set via `?worker&url` (required by MapLibre 6 with Vite). In dev only, the console shows `ReferenceError: document is not defined` from Vite's client injected in that worker: harmless, absent from production builds.
- Map components build on `MapView` (`center`/`zoom`, or `bounds` for the first view) and add their sources and layers in its `load` event. Highlights use feature state with `promoteId`, not rebuilt data. Popups use `setText`: route names are user content.
- Testing maps in the desktop app's browser pane: MapLibre only finishes loading while the pane is visible (hidden tabs pause rendering), and tiles can take a few seconds after `[data-map-loaded]`.
- Basemaps (`app/utils/basemaps.ts`): the MapTiler style is always loaded (glyphs, sprites); Plan IGN is a raster layer added on `style.load`, above the style and below the app's layers. Picking it hides every style layer that has a source, so MapLibre requests no MapTiler tiles. The choice lives in localStorage (`sport-map:basemap`); `MapView` puts the picker in a MapLibre control filled by a `Teleport`. SCAN 25 is left out: its free use (professional or associative) doesn't cover a public site. e2e tests mock `data.geopf.fr`.
- e2e runs with a fake MapTiler key (`playwright.config.ts`): `fixtures.ts` serves an empty style for `api.maptiler.com/maps/**` and no geocoding result, and tests mock their own places. `MapView` exposes `data-map-loaded`, `data-map-center` ("lng,lat") and `data-map-bearing` (whole degrees, 0 to 359), both updated after each move, for tests.
- 3D view (`app/utils/mapTerrain.ts`): `MapView relief` (home, route page, collection page, /discover; never the editor nor follow/record) adds a "3D" button to the basemap control group, only when the style has a `raster-dem` source (MapTiler Outdoor's `terrain-rgb`; none in the demo or e2e styles). The terrain shares that source with the style's hillshade (a second source would load every elevation tile twice), exaggeration 1.5, pitch 60 (MapLibre's default maximum: the horizon stays off screen, so no sky and no far tiles). Choice in localStorage `sport-map:map-3d`, 2D by default; a saved 3D view is passed as the constructor's `pitch`, so initial bounds are framed tilted. Under Plan IGN, the terrain still loads MapTiler elevation tiles (MapTiler quota).
- A tilted map sees ~15 times further than its centre at 60°: `mapViewState` then returns the bounds seen from above at the same centre and zoom (`flatViewBounds`), so searches (home, /discover) keep their size.
- Testing 3D: e2e use `mockReliefStyle` (fixtures, a sea-level elevation source) and never wait for `[data-map-loaded]` on a map opening in 3D: without a GPU (CI runners) the relief takes over 15 s to load; check the button state instead. In the hidden browser pane, `easeTo` doesn't animate (pitch stays 0): screenshots come from a separate headless Playwright launched with `--use-angle=swiftshader --enable-unsafe-swiftshader` (or `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` for the machine's GPU, needed for anything animated), signed in as the local e2e user.
