import type { FetchError } from 'ofetch'
import { type Bbox, OSM_ROUTE_TAGS, type OsmRoute, type OsmRouteKind, type OverpassRelation, toOsmRoute } from '#shared/utils/osmRoutes'
import { type OsmPlace, osmPlacesFrom, osmPlacesQuery, type OverpassElement } from '#shared/utils/osmPlaces'
import type { LngLat } from '#shared/utils/routes'
import { loopViaPlaces, loopViaQuery, type LoopViaType, type NamedOverpassElement, type NamedPlace, namedPlaceQuery, namedPlacesFrom } from '#shared/utils/loops'
import { LOOP_VIA_CACHE_RADIUS_M, nearestLoopPlaces } from '#shared/utils/loopPlacesCache'
import { LocalizedError } from '~/utils/localizedError'
import { cachedLoopPlaces } from '~/utils/loopPlacesCache'

// The Overpass API (#69), queried from the browser: it allows 2 queries at a time per IP address, and the server
// functions' addresses are shared with other sites on Vercel. Free, without a key, shared by every OSM tool and
// often busy: a busy instance answers 504 after a few seconds, then often answers the same query in two. Each
// instance is tried twice, in turn, within SEARCH_BUDGET_MS.
//
// Only instances run in the EU (#312): each query tells the server an area around the member's start or map view, with
// their IP address. The Russian one (maps.mail.ru, VK) was dropped. Instances that need a key are left out: a key
// can't be hidden in the browser.
// - overpass-api.de: FOSSGIS (Germany), the main one, whole planet, often overloaded.
// - ovp.dresel.systems: Europe only (Geofabrik extract), 4 queries at a time per IP; answered in 7 s when the
//   others didn't on 2026-11-12. Elsewhere it answers nothing found, so it is only asked for an area in Europe.
// - overpass.private.coffee: Private.coffee (Austrian non-profit, formerly overpass.kumi.systems), whole planet, no rate
//   limit, keeps a truncated IP for 48 h.
const OVERPASS_DE = 'https://overpass-api.de/api/interpreter'
const DRESEL_EUROPE = 'https://ovp.dresel.systems/api/interpreter'
const PRIVATE_COFFEE = 'https://overpass.private.coffee/api/interpreter'
export const OVERPASS_URLS = [OVERPASS_DE, DRESEL_EUROPE, PRIVATE_COFFEE]
// Well inside the European extract (Portugal to Finland, Ireland to Greece), so a point near its edge never goes to it.
const EUROPE = { west: -11, south: 35, east: 32, north: 71 }

// The instances to try for an area given by its points (a start, a bbox's corners, a track), in order.
export function overpassUrlsFor(points: LngLat[]): string[] {
  const inEurope = points.length > 0 && points.every(([lng, lat]) =>
    lng >= EUROPE.west && lng <= EUROPE.east && lat >= EUROPE.south && lat <= EUROPE.north)
  return inEurope ? [OVERPASS_DE, DRESEL_EUROPE, PRIVATE_COFFEE] : [OVERPASS_DE, PRIVATE_COFFEE]
}
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

// `area`: points of the searched area, which pick the instances (`overpassUrlsFor`).
async function queryOverpass<T>(query: string, area: LngLat[], signal?: AbortSignal): Promise<T[]> {
  const urls = overpassUrlsFor(area)
  const attempts = Array.from({ length: ROUNDS }, () => urls).flat()
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

  const [west, south, east, north] = bbox
  const routes = (await queryOverpass<OverpassRelation>(overpassQuery(bbox, kind), [[west, south], [east, north]], signal))
    .filter(element => element.type === 'relation')
    .map(toOsmRoute)
    .filter(route => route !== null)

  cache.delete(key)
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, routes })
  // A Map keeps insertion order: the first key is the oldest search.
  if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!)
  return routes
}

// The peaks or drinking water points around a loop's start (#214), as far as any loop from its cell can go: kept for
// the family (#311, `cachedLoopPlaces`), the loop store keeping the last search; pickLoopVia keeps those in reach.
export async function searchLoopVia(type: LoopViaType, start: LngLat, signal?: AbortSignal): Promise<OsmPlace[]> {
  return cachedLoopPlaces({ kind: type }, start, async centre => ({
    places: nearestLoopPlaces(loopViaPlaces(await queryOverpass<OverpassElement>(loopViaQuery(type, centre, LOOP_VIA_CACHE_RADIUS_M, QUERY_TIMEOUT_S), [centre], signal)), centre),
    complete: true,
  }), signal)
}

// The places of that name around a loop's start that Overpass knows (#293): none for a place said by its kind only
// (« le lac »). `searchNamedPlaces` (namedPlaces.ts) also asks MapTiler and Nominatim (#310).
export async function searchOverpassNamedPlaces(name: string, start: LngLat, signal?: AbortSignal): Promise<NamedPlace[]> {
  const query = namedPlaceQuery(name, start, QUERY_TIMEOUT_S)
  if (!query) return []
  return namedPlacesFrom(await queryOverpass<NamedOverpassElement>(query, [start], signal), start)
}

// The useful places near a route's track (#52). Not cached: the route page saves them with the route.
export async function searchOsmPlaces(track: LngLat[], signal?: AbortSignal): Promise<OsmPlace[]> {
  return osmPlacesFrom(await queryOverpass<OverpassElement>(osmPlacesQuery(track, QUERY_TIMEOUT_S), track, signal), track)
}
