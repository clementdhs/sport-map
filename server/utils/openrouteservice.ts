import type { H3Event } from 'h3'
import type { FetchError } from 'ofetch'
import { type LngLat, type LngLatEle, ROUTING_PROFILES, type SportType, type WayInfo, type WayRange } from '#shared/utils/routes'
import { withoutZeroElevations } from '#shared/utils/trackElevation'

const ORS_URL = 'https://api.openrouteservice.org'

// ORS error codes: 2009 = no route between the points, 2010 = no routable way near a point,
// 2004 = request exceeds the server limits (e.g. distance).
const NO_ROUTE_CODES = new Set([2009, 2010])
const LIMIT_EXCEEDED_CODE = 2004

// Answers take a few seconds, round trips included. Without a limit, an ORS outage kept loop requests waiting
// 2 minutes for its gateway's 504 (#155).
const ORS_TIMEOUT_MS = 20_000

export class NoRouteFoundError extends Error {}

async function orsPost<T>(event: H3Event, path: string, body: Record<string, unknown>): Promise<T> {
  const { openrouteserviceKey } = useRuntimeConfig()
  if (!openrouteserviceKey) {
    throw apiError(event, 503, 'api.routingNotConfigured')
  }

  try {
    return await $fetch(`${ORS_URL}${path}`, {
      method: 'POST',
      // The geojson directions endpoint answers 406 to a plain `application/json` Accept header.
      headers: { Authorization: openrouteserviceKey, Accept: 'application/geo+json, application/json' },
      body,
      timeout: ORS_TIMEOUT_MS,
    }) as T
  }
  catch (error) {
    const { response, data, cause } = error as FetchError<{ error?: { code?: number } }>
    if ((cause as Error | undefined)?.name === 'TimeoutError') {
      console.error('[openrouteservice]', path, `no answer after ${ORS_TIMEOUT_MS} ms`)
      throw apiError(event, 504, 'api.routingTimeout')
    }
    const code = data?.error?.code
    if (code && NO_ROUTE_CODES.has(code)) throw new NoRouteFoundError()
    if (code === LIMIT_EXCEEDED_CODE) {
      throw apiError(event, 422, 'api.segmentTooLong')
    }
    if (response?.status === 429) {
      throw apiError(event, 429, 'api.routingTooFast')
    }
    console.error('[openrouteservice]', path, response?.status, data)
    throw apiError(event, 502, 'api.routingUnavailable')
  }
}

type OrsExtras = Partial<Record<'surface' | 'waytype' | 'traildifficulty', { values: WayRange[] }>>

// Trail difficulty is on the SAC scale for walking profiles and on the MTB scale for cycling ones.
function toWayInfo(extras: OrsExtras | undefined, profile: string): WayInfo | null {
  if (!extras) return null
  const difficulty = extras.traildifficulty?.values ?? []
  const cycling = profile.startsWith('cycling')
  return {
    surface: extras.surface?.values ?? [],
    waytype: extras.waytype?.values ?? [],
    sac_scale: cycling ? [] : difficulty,
    mtb_scale: cycling ? difficulty : [],
  }
}

type OrsFeature = { geometry: { coordinates: LngLatEle[] }, properties?: { extras?: OrsExtras, summary?: { distance?: number } } }

async function directions(event: H3Event, sport: SportType, body: Record<string, unknown>, profile = ROUTING_PROFILES[sport]) {
  const result = await orsPost<{ features: OrsFeature[] }>(
    event,
    `/v2/directions/${profile}/geojson`,
    { ...body, elevation: true, instructions: false, extra_info: ['surface', 'waytype', 'traildifficulty'] },
  )
  const feature = result.features[0]!
  const coordinates = feature.geometry.coordinates
  const elevations = withoutZeroElevations(
    coordinates.map(([lng, lat]): LngLat => [lng, lat]),
    coordinates.map(([, , ele]) => ele),
  )
  return {
    points: coordinates.map(([lng, lat], i): LngLatEle => [lng, lat, elevations[i]!]),
    wayInfo: toWayInfo(feature.properties?.extras, profile),
    lengthM: feature.properties?.summary?.distance ?? 0,
  }
}

// The track along paths, and what is known of its ways (indexed in its points).
export async function routeAlongPaths(event: H3Event, from: LngLat, to: LngLat, sport: SportType): Promise<{ points: LngLatEle[], wayInfo: WayInfo | null }> {
  return directions(event, sport, { coordinates: [from, to] })
}

// Points the round trip goes through, around the start: 5 made rounder loops than 3, but further from the
// asked length on test loops.
const LOOP_POINTS = 3

// A loop from the start of about lengthM (#50), the seed picking its direction; `profile` replaces the sport's to
// prefer paths (#295, `loopProfile`).
export async function roundTrip(event: H3Event, start: LngLat, lengthM: number, sport: SportType, seed: number, profile?: string): Promise<{ points: LngLatEle[], wayInfo: WayInfo | null, lengthM: number }> {
  return directions(event, sport, { coordinates: [start], options: { round_trip: { length: lengthM, points: LOOP_POINTS, seed } } }, profile)
}

// A route through these points (#214: a loop through a place, the way out of an out and back), each snapped to the
// paths within its radius (m, -1 for the largest).
export async function routeThrough(event: H3Event, points: LngLat[], radiuses: number[], sport: SportType, profile?: string): Promise<{ points: LngLatEle[], wayInfo: WayInfo | null, lengthM: number }> {
  return directions(event, sport, { coordinates: points, radiuses }, profile)
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const round1 = (value: number) => Math.round(value * 10) / 10

// Named: an inline return type would hide the next export from Nitro's auto-imports (see CLAUDE.md).
type TrackFields = { coordinates: LngLat[], elevations: number[] }

// A track as the API sends it: coordinates to ~10 cm, elevations to 10 cm.
export function trackFields(points: LngLatEle[]): TrackFields {
  return {
    coordinates: points.map(([lng, lat]) => [round6(lng), round6(lat)]),
    elevations: points.map(([, , ele]) => round1(ele)),
  }
}
