---
paths:
  - "app/components/map/**"
  - "app/utils/routeLayers.ts"
  - "app/utils/mapStyle.ts"
---

# Maps (MapLibre)

- MapLibre is imported only client-side (dynamic import in `onMounted`), and its worker URL is set via `?worker&url` (required by MapLibre 6 with Vite). In dev only, the console shows `ReferenceError: document is not defined` from Vite's client injected in that worker: harmless, absent from production builds.
- Map components build on `MapView` (`center`/`zoom`, or `bounds` for the first view) and add their sources and layers in its `load` event. Highlights use feature state with `promoteId`, not rebuilt data. Popups use `setText`: route names are user content.
- Testing maps in the desktop app's browser pane: MapLibre only finishes loading while the pane is visible (hidden tabs pause rendering), and tiles can take a few seconds after `[data-map-loaded]`.
