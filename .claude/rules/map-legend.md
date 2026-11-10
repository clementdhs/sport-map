---
paths:
  - "app/components/map/MapLegend.vue"
  - "app/components/map/MapLegendGroups.vue"
  - "app/utils/mapLegend.ts"
  - "app/utils/routeLayers.ts"
  - "app/utils/osmRouteLayers.ts"
  - "app/utils/loopLayers.ts"
  - "app/components/map/PoiMarkers.vue"
---

# Map legend (#76)

- Opened by the "Légende" button of the map's "Calques" panel (#104), on every map, in the panel's place: the panel closes, and opening it again closes the legend (both sit beside the same button). A popover from md up, anchored on the "Calques" button (`reference`), a drawer below (`useIsDesktop`, like the filters). It has no trigger of its own: `MapView` holds `v-model:open`, and on close focus goes back to the "Calques" button. vaul keeps focus where it was when a drawer opens (no phone keyboard popping up), here a button that is gone: `onOpenAutoFocus` focuses the drawer. Two tabs: "Fond de carte" (the basemap **shown**, `shownBasemap`: MapTiler offline even when Plan IGN is picked) and "Tracés et symboles". On a computer it stays open while the map is dragged: `interactOutside` is prevented inside `.maplibregl-map`; Escape, the "Calques" button or a click elsewhere close it.
- App symbols (`APP_LEGEND`, `app/utils/mapLegend.ts`) are built from the constants that draw them (`ROUTE_COLOR`, `CASING_COLOR`, the marker drawings of `mapMarkers.ts` as `marker` samples, `GPS_COLOR`, `GPS_ARROW_POINTS`, `OSM_ROUTE_LINE`, `POI_COLORS`/`POI_ICONS`, slope, surface and difficulty classes). A new symbol drawn on a map gets an entry there, with its colours exported rather than copied.
- MapTiler Outdoor has no official legend: `MAPTILER_LEGEND` lists outdoor-v2 layer ids by hand (Track, Path and Path minor look the same, so one entry). Samples are read from `map.getStyle()` when the legend opens, evaluated at `LEGEND_ZOOM` = 16 (where paths and trails are drawn) with `normalizePropertyExpression` from `@maplibre/maplibre-gl-style-spec` (direct dependency, keep its version on maplibre-gl's), with feature properties picking the branch of data expressions (`nth_line`, waymark `color`, cycle `network`). A sample needs all its layers: a layer MapTiler renames or removes hides its entry, never an error. Icon opacity is ignored (it hides some icons at 16).
- MapTiler's sprite icons are all SDF: `paintSdf` colours them like MapLibre's symbol shader (icon colour over the halo, edge at 0.75, halo edge `(6 - width / size) / 8`). Samples are drawn over the style's background, so they read the same in light and dark mode.
- `MapLegend` is lazy (`LazyMapLegend`): the expression evaluator stays out of the page bundles; the service worker precaches its chunk like every other, so the legend works offline.
- Plan IGN: the official image declared by the WMTS GetCapabilities (`IGN_PLAN_LEGEND_URL`, 300 × 6000 px, ~420 KB), requested only when the basemap tab shows it. e2e mocks `data.geopf.fr`; with the fixtures' empty style the MapTiler part says "Pas de légende pour ce fond de carte." (`maps.spec.ts`).
