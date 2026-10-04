---
paths:
  - "app/components/map/**"
  - "app/utils/routeLayers.ts"
  - "app/utils/mapStyle.ts"
  - "app/utils/basemaps.ts"
---

# Maps (MapLibre)

- MapLibre is imported only client-side (dynamic import in `onMounted`), and its worker URL is set via `?worker&url` (required by MapLibre 6 with Vite). In dev only, the console shows `ReferenceError: document is not defined` from Vite's client injected in that worker: harmless, absent from production builds.
- Map components build on `MapView` (`center`/`zoom`, or `bounds` for the first view) and add their sources and layers in its `load` event. Highlights use feature state with `promoteId`, not rebuilt data. Popups use `setText`: route names are user content.
- Testing maps in the desktop app's browser pane: MapLibre only finishes loading while the pane is visible (hidden tabs pause rendering), and tiles can take a few seconds after `[data-map-loaded]`.
- Basemaps (`app/utils/basemaps.ts`): the MapTiler style is always loaded (glyphs, sprites); Plan IGN is a raster layer added on `style.load`, above the style and below the app's layers. Picking it hides every style layer that has a source, so MapLibre requests no MapTiler tiles. The choice lives in localStorage (`sport-map:basemap`); `MapView` puts the picker in a MapLibre control filled by a `Teleport`. SCAN 25 is left out: its free use (professional or associative) doesn't cover a public site. e2e tests mock `data.geopf.fr`.
- e2e runs with a fake MapTiler key (`playwright.config.ts`): `fixtures.ts` serves an empty style for `api.maptiler.com/maps/**` and no geocoding result, and tests mock their own places. `MapView` exposes `data-map-loaded` and `data-map-center` ("lng,lat", after each move) for tests.
