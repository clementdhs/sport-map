import type { LngLat } from '#shared/utils/routes'
import {
  OFFLINE_MAX_AGE_DAYS,
  OFFLINE_MAX_FILES,
  OFFLINE_MAX_ZOOM,
  OFFLINE_MIN_ZOOM,
  OFFLINE_CACHE_PREFIX,
  offlineCacheName,
  offlinePagePaths,
  offlineTiles,
  withNeighbours,
} from '#shared/utils/offlineMaps'

// Prepares a route for the follow mode without network: downloads the follow page, the route and the map
// along the track into a cache of its own, which the service worker serves when offline.

export interface OfflineRouteInfo {
  name: string
  preparedAt: number
  bytes: number
  files: number
}

const INDEX_KEY = 'sport-map:offline-routes'
// Routes being downloaded: their cache is not in the index yet, and purgeOfflineRoutes must leave it alone.
const preparing = new Set<string>()
const DOWNLOADS_AT_ONCE = 6

// Glyph ranges MapLibre loads for French labels: Latin, Latin extended, punctuation (’ – …).
const GLYPH_RANGES = ['0-255', '256-511', '8192-8447']
// MapLibre's font when a symbol layer has none.
const DEFAULT_FONT_STACK = 'Open Sans Regular,Arial Unicode MS Regular'

type Json = Record<string, unknown>
type FetchJson = (url: string) => Promise<Json>

export function offlineSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window && 'serviceWorker' in navigator
}

export function listOfflineRoutes(): Record<string, OfflineRouteInfo> {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '{}') as Record<string, OfflineRouteInfo>
  }
  catch {
    return {}
  }
}

function saveIndex(index: Record<string, OfflineRouteInfo>) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  }
  catch { /* storage blocked: the caches still work, they just aren't listed */ }
}

// Font stacks of the style's symbol layers ("text-font" is an array, or an expression holding literals).
function fontStacks(layers: Json[]): string[] {
  const stacks = new Set<string>()
  const isStack = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string')
  // Inside an expression, font stacks are the ["literal", [...]] values.
  const collectLiterals = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (value[0] === 'literal' && isStack(value[1])) stacks.add(value[1].join(','))
    else value.forEach(collectLiterals)
  }
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    const layout = (layer.layout ?? {}) as Json
    const font = layout['text-font']
    if (isStack(font)) stacks.add(font.join(','))
    else if (font) collectLiterals(font)
    else if (layout['text-field']) stacks.add(DEFAULT_FONT_STACK)
  }
  return [...stacks]
}

// Everything MapLibre loads to draw the corridor of `track` with the style at `styleUrl`: the style, its
// sprites and fonts, the sources' TileJSON and their tiles. Built the way MapLibre builds its requests, so
// that the service worker finds them in the cache.
export async function mapResourceUrls(styleUrl: string, track: LngLat[], fetchJson: FetchJson): Promise<string[]> {
  const urls = new Set<string>([styleUrl])
  const style = await fetchJson(styleUrl)

  const sprites = typeof style.sprite === 'string'
    ? [style.sprite]
    : Array.isArray(style.sprite) ? (style.sprite as { url: string }[]).map(s => s.url) : []
  for (const sprite of sprites) {
    for (const format of ['', '@2x']) {
      for (const extension of ['.json', '.png']) {
        const url = new URL(sprite)
        url.pathname += `${format}${extension}`
        urls.add(url.toString())
      }
    }
  }

  if (typeof style.glyphs === 'string') {
    for (const stack of fontStacks((style.layers ?? []) as Json[])) {
      for (const range of GLYPH_RANGES) urls.add(style.glyphs.replace('{fontstack}', stack).replace('{range}', range))
    }
  }

  for (const source of Object.values((style.sources ?? {}) as Record<string, Json>)) {
    if (!['vector', 'raster', 'raster-dem'].includes(source.type as string)) continue
    let tileJson = source
    if (typeof source.url === 'string') {
      urls.add(source.url)
      tileJson = await fetchJson(source.url)
    }
    const templates = (tileJson.tiles ?? source.tiles ?? []) as string[]
    const minZoom = Math.max(OFFLINE_MIN_ZOOM, (tileJson.minzoom as number | undefined) ?? 0)
    const maxZoom = Math.min(OFFLINE_MAX_ZOOM, (tileJson.maxzoom as number | undefined) ?? 22)
    for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
      const tiles = offlineTiles(track, zoom)
      for (const tile of source.type === 'raster-dem' ? withNeighbours(tiles) : tiles) {
        const [z, x, y] = tile.split('/')
        for (const template of templates) urls.add(template.replace('{z}', z!).replace('{x}', x!).replace('{y}', y!))
      }
    }
  }
  return [...urls]
}

async function runLimited(tasks: (() => Promise<void>)[], limit: number) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]!()
  }))
}

// `styleUrls`: the light and dark styles (the map follows the theme, #109). They share their sources, so the
// second one only adds its style and sprite files.
export async function prepareOfflineRoute(
  route: { id: string, name: string, coordinates: LngLat[] },
  styleUrls: string[],
  onProgress: (done: number, total: number) => void,
): Promise<OfflineRouteInfo> {
  const json = new Map<string, Promise<Json>>()
  const fetchJson: FetchJson = (url) => {
    if (!json.has(url)) json.set(url, fetch(url).then(response => response.json()))
    return json.get(url)!
  }
  const lists = await Promise.all(styleUrls.map(styleUrl => mapResourceUrls(styleUrl, route.coordinates, fetchJson)))
  const mapUrls = [...new Set(lists.flat())]
  if (mapUrls.length > OFFLINE_MAX_FILES) {
    throw new LocalizedError('errors.offlineTooLong')
  }

  const name = offlineCacheName(route.id)
  preparing.add(route.id)
  try {
    return await download(route, name, mapUrls, onProgress)
  }
  finally {
    preparing.delete(route.id)
  }
}

async function download(
  route: { id: string, name: string },
  name: string,
  mapUrls: string[],
  onProgress: (done: number, total: number) => void,
): Promise<OfflineRouteInfo> {
  await caches.delete(name)
  const cache = await caches.open(name)
  const pages = offlinePagePaths(route.id)
  const all = [...pages, ...mapUrls]
  let done = 0
  let bytes = 0
  let files = 0
  onProgress(0, all.length)

  await runLimited(all.map(url => async () => {
    try {
      const response = await fetch(url)
      if (response.ok) {
        bytes += (await response.clone().blob()).size
        await cache.put(url, response)
        files++
      }
      // Missing tiles (sea, outside the map's coverage) are simply left out.
      else if (pages.includes(url)) {
        throw new Error(`${url} : ${response.status}`)
      }
    }
    finally {
      onProgress(++done, all.length)
    }
  }), DOWNLOADS_AT_ONCE)

  const info: OfflineRouteInfo = { name: route.name, preparedAt: Date.now(), bytes, files }
  saveIndex({ ...listOfflineRoutes(), [route.id]: info })
  return info
}

// The route's data changed after it was prepared (its useful places, #52): its pages are downloaded again, the
// map files stay. Nothing to do for a route that isn't prepared, or while it is.
export async function refreshOfflineRoutePages(routeId: string) {
  if (!offlineSupported() || preparing.has(routeId) || !listOfflineRoutes()[routeId]) return
  const cache = await caches.open(offlineCacheName(routeId))
  await Promise.all(offlinePagePaths(routeId).map(async (url) => {
    const response = await fetch(url)
    if (response.ok) await cache.put(url, response)
  }))
}

export async function removeOfflineRoute(routeId: string) {
  await caches.delete(offlineCacheName(routeId))
  const { [routeId]: _removed, ...rest } = listOfflineRoutes()
  saveIndex(rest)
}

// The cache is temporary (MapTiler's terms): expired routes are removed, and so are caches left without an
// index entry or index entries without a cache (e.g. browser data partly cleared).
export async function purgeOfflineRoutes(now = Date.now()) {
  const index = listOfflineRoutes()
  const maxAgeMs = OFFLINE_MAX_AGE_DAYS * 24 * 3600 * 1000
  const names = (await caches.keys()).filter(name => name.startsWith(OFFLINE_CACHE_PREFIX))
  const kept: Record<string, OfflineRouteInfo> = {}
  for (const name of names) {
    const id = name.slice(OFFLINE_CACHE_PREFIX.length)
    if (preparing.has(id)) continue
    const info = index[id]
    if (info && now - info.preparedAt < maxAgeMs) kept[id] = info
    else await caches.delete(name)
  }
  saveIndex(kept)
}

export function offlineExpiry(info: OfflineRouteInfo): Date {
  return new Date(info.preparedAt + OFFLINE_MAX_AGE_DAYS * 24 * 3600 * 1000)
}
