import type { LngLat } from './routes'

// Routes prepared for offline use (follow mode without network). Everything is stored on the phone only,
// in one Cache Storage cache per route, which the service worker (service-worker/sw.ts) reads when the
// network fails. MapTiler's terms allow a temporary personal cache on the user's device, not on a server:
// prepared routes expire after OFFLINE_MAX_AGE_DAYS and can be deleted at any time.

export const OFFLINE_CACHE_PREFIX = 'sport-map-offline-'
export const OFFLINE_MAX_AGE_DAYS = 30

// Map detail kept along the track: from a regional overview to walking scale (the follow mode shows zoom 16,
// drawn from zoom 14-15 vector tiles). Low zooms only add a few tiles.
export const OFFLINE_MIN_ZOOM = 8
export const OFFLINE_MAX_ZOOM = 15
// Width of the corridor kept on each side of the track.
export const OFFLINE_CORRIDOR_M = 1000
// Up to this zoom, tiles are large: the whole area of the route is kept, e.g. the inside of a loop.
export const OFFLINE_AREA_MAX_ZOOM = 12
// Beyond this many map files, preparing would eat into the free monthly quota (100,000 requests).
export const OFFLINE_MAX_FILES = 4000

export function offlineCacheName(routeId: string): string {
  return `${OFFLINE_CACHE_PREFIX}${routeId}`
}

// Map servers whose files (style, tiles, fonts, sprites) the service worker serves from the offline caches.
export const MAP_HOSTS = ['api.maptiler.com', 'demotiles.maplibre.org']

// Pages of the app served from the offline cache when the network fails.
export function offlinePagePaths(routeId: string): string[] {
  return [`/routes/${routeId}/follow`, `/api/routes/${routeId}`]
}

const FOLLOW_PAGE = /^\/routes\/[0-9a-f-]{36}\/follow$/
const ROUTE_API = /^\/api\/routes\/[0-9a-f-]{36}$/

export function isOfflinePagePath(pathname: string): boolean {
  return FOLLOW_PAGE.test(pathname) || ROUTE_API.test(pathname)
}

// Web Mercator tile containing a point.
export function tileAt([lng, lat]: LngLat, zoom: number): { x: number, y: number } {
  const n = 2 ** zoom
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const rad = (clampedLat * Math.PI) / 180
  return {
    x: Math.min(n - 1, Math.max(0, Math.floor(((lng + 180) / 360) * n))),
    y: Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n))),
  }
}

// Tiles ("z/x/y") covering the track and a corridor of `corridorM` on each side, at one zoom level.
export function corridorTiles(track: LngLat[], zoom: number, corridorM: number): string[] {
  const tiles = new Set<string>()
  const metersPerDegLat = 111_320
  // Samples closer than a tile's size apart, so that no tile along the track is skipped.
  const tileSizeM = (40_075_016 / 2 ** zoom) * Math.cos(((track[0]?.[1] ?? 0) * Math.PI) / 180)
  const stepM = Math.max(10, Math.min(tileSizeM / 2, corridorM))

  const addAround = ([lng, lat]: LngLat) => {
    const dLat = corridorM / metersPerDegLat
    const dLng = corridorM / (metersPerDegLat * Math.cos((lat * Math.PI) / 180))
    const min = tileAt([lng - dLng, lat + dLat], zoom)
    const max = tileAt([lng + dLng, lat - dLat], zoom)
    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) tiles.add(`${zoom}/${x}/${y}`)
    }
  }

  track.forEach((point, i) => {
    addAround(point)
    const next = track[i + 1]
    if (!next) return
    // Intermediate samples on long segments.
    const segmentM = Math.hypot(
      (next[0] - point[0]) * metersPerDegLat * Math.cos((point[1] * Math.PI) / 180),
      (next[1] - point[1]) * metersPerDegLat,
    )
    const steps = Math.floor(segmentM / stepM)
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1)
      addAround([point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t])
    }
  })
  return [...tiles]
}

// Tiles covering the bounding box of the track, widened by `marginM`, at one zoom level.
export function areaTiles(track: LngLat[], zoom: number, marginM: number): string[] {
  const lngs = track.map(([lng]) => lng)
  const lats = track.map(([, lat]) => lat)
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const dLat = marginM / 111_320
  const dLng = marginM / (111_320 * Math.cos((midLat * Math.PI) / 180))
  const min = tileAt([Math.min(...lngs) - dLng, Math.max(...lats) + dLat], zoom)
  const max = tileAt([Math.max(...lngs) + dLng, Math.min(...lats) - dLat], zoom)
  const tiles: string[] = []
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) tiles.push(`${zoom}/${x}/${y}`)
  }
  return tiles
}

// Tiles kept offline at one zoom level: the whole area at low zooms, unless that costs far more than the
// corridor (a long straight route), else the corridor along the track.
export function offlineTiles(track: LngLat[], zoom: number): string[] {
  const corridor = corridorTiles(track, zoom, OFFLINE_CORRIDOR_M)
  if (zoom > OFFLINE_AREA_MAX_ZOOM) return corridor
  const area = areaTiles(track, zoom, OFFLINE_CORRIDOR_M)
  return area.length <= corridor.length * 3 ? area : corridor
}

// The tiles and their 8 neighbours. Elevation (raster-dem) sources need them: MapLibre loads the neighbours
// of each tile to shade its edges.
export function withNeighbours(tiles: string[]): string[] {
  const all = new Set(tiles)
  for (const tile of tiles) {
    const [z, x, y] = tile.split('/').map(Number) as [number, number, number]
    const max = 2 ** z - 1
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx
        const ny = y + dy
        if (ny >= 0 && ny <= max) all.add(`${z}/${(nx + max + 1) % (max + 1)}/${ny}`)
      }
    }
  }
  return [...all]
}
