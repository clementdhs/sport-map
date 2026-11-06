import type { FetchError } from 'ofetch'
import { type Bbox, OSM_ROUTE_TAGS, type OsmRoute, type OsmRouteKind, type OverpassRelation, toOsmRoute } from '#shared/utils/osmRoutes'
import { type OsmPlace, osmPlacesFrom, osmPlacesQuery, type OverpassElement } from '#shared/utils/osmPlaces'
import type { LngLat } from '#shared/utils/routes'
import { LocalizedError } from '~/utils/localizedError'

// The Overpass API (#69), queried from the browser: it allows 2 queries at a time per IP address, and the server
// functions' addresses are shared with other sites on Vercel. Free, without a key, shared by every OSM tool and
// often busy: a busy instance answers 504 after a few seconds, then often answers the same query in two. Each
// instance is tried twice, in turn, within SEARCH_BUDGET_MS.
export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const QUERY_TIMEOUT_S = 25
const ROUNDS = 2
const SEARCH_BUDGET_MS = 60_000
// Not worth starting an attempt with less time left.
const MIN_ATTEMPT_MS = 5000

// Results of the last searches in this tab: going back to an area, or switching the kind back, doesn't query
// Overpass again.
const CACHE_TTL_MS = 15 * 60_000
const CACHE_MAX_ENTRIES = 20
const cache = new Map<string, { expires: number, routes: OsmRoute[] }>()

export function clearOverpassCache() {
  cache.clear()
}

interface OverpassResponse<T> {
  elements?: T[]
  // Set when the query was stopped by the server's limits: the elements are then incomplete.
  remark?: string
}

// Overpass takes south, west, north, east. `meta` adds the relation's version, which keys its cached elevation gain.
export function overpassQuery([minLng, minLat, maxLng, maxLat]: Bbox, kind: OsmRouteKind): string {
  const routes = OSM_ROUTE_TAGS[kind].join('|')
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];relation["type"="route"]["route"~"^(${routes})$"](${minLat},${minLng},${maxLat},${maxLng});out meta geom;`
}

async function queryOverpass<T>(query: string, signal?: AbortSignal): Promise<T[]> {
  const attempts = Array.from({ length: ROUNDS }, () => OVERPASS_URLS).flat()
  const deadline = Date.now() + SEARCH_BUDGET_MS
  for (const url of attempts) {
    const timeLeft = deadline - Date.now()
    if (timeLeft < MIN_ATTEMPT_MS) break
    try {
      // A form body keeps it a simple CORS request, without a preflight.
      const data = await $fetch<OverpassResponse<T>>(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams({ data: query }),
        timeout: Math.min((QUERY_TIMEOUT_S + 5) * 1000, timeLeft),
        signal,
      })
      // A query stopped by a timeout still answers 200, with what was found before.
      if (!Array.isArray(data?.elements) || data.remark?.includes('error')) {
        console.warn('[overpass]', url, data?.remark ?? 'unexpected answer')
        continue
      }
      return data.elements
    }
    catch (error) {
      // A newer search replaced this one.
      if (signal?.aborted) throw error
      const { response } = error as FetchError
      console.warn('[overpass]', url, response?.status ?? (error as Error).message)
    }
  }
  throw new LocalizedError('errors.overpassBusy')
}

// The marked routes of a kind crossing the area (an osmSearchBbox, which callers check with fitsOsmSearch).
export async function searchOsmRoutes(bbox: Bbox, kind: OsmRouteKind, signal?: AbortSignal): Promise<OsmRoute[]> {
  const key = `${kind}:${bbox.join(',')}`
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.routes

  const routes = (await queryOverpass<OverpassRelation>(overpassQuery(bbox, kind), signal))
    .filter(element => element.type === 'relation')
    .map(toOsmRoute)
    .filter(route => route !== null)

  cache.delete(key)
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, routes })
  // A Map keeps insertion order: the first key is the oldest search.
  if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  return routes
}

// The useful places near a route's track (#52). Not cached: the route page saves them with the route.
export async function searchOsmPlaces(track: LngLat[], signal?: AbortSignal): Promise<OsmPlace[]> {
  return osmPlacesFrom(await queryOverpass<OverpassElement>(osmPlacesQuery(track, QUERY_TIMEOUT_S), signal), track)
}
