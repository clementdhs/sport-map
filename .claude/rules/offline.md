---
paths:
  - "service-worker/**"
  - "app/utils/offlineRoute.ts"
  - "shared/utils/offlineMaps.ts"
  - "app/components/RouteOffline.vue"
  - "app/plugins/offline-routes.client.ts"
  - "app/utils/mapStyle.ts"
  - "app/utils/basemaps.ts"
---

# Offline routes (PWA)

The PWA uses its own service worker (`service-worker/sw.ts`, injectManifest, typed by `service-worker/tsconfig.json`, checked by `npm run typecheck`). "Préparer pour le hors-ligne" (`app/utils/offlineRoute.ts`) downloads the follow page, the route data and the map files MapLibre will request (style, sprites, fonts, TileJSON, tiles of the corridor, whole area at low zoom, neighbours for elevation tiles) into one Cache Storage cache per route; the service worker serves map hosts cache-first and the follow page/route API network-first with that fallback. MapTiler only allows a temporary personal cache on the device: caches expire after 30 days (purged at startup), never on a server. URLs must match MapLibre's exactly (`mapStyleUrl` is shared with `MapView`). A 30 km route costs ~650 MapTiler requests. e2e tests block service workers except the offline test. Service worker changes are global: push them on a branch and wait for a green CI before main. Only the MapTiler basemap is prepared: without network, `MapView` shows it even when the visitor picked Plan IGN (`shownBasemap`).
