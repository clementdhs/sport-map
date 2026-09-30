import type { H3Event } from 'h3'
import type { FetchError } from 'ofetch'
import type { LngLat, SportType } from '#shared/utils/routes'

type LngLatEle = [lng: number, lat: number, ele: number]

const ORS_URL = 'https://api.openrouteservice.org'

const PROFILES: Record<SportType, string> = {
  running: 'foot-walking',
  hiking: 'foot-hiking',
  cycling: 'cycling-regular',
}

// ORS error codes: 2009 = no route between the points, 2010 = no routable way near a point,
// 2004 = request exceeds the server limits (e.g. distance).
const NO_ROUTE_CODES = new Set([2009, 2010])
const LIMIT_EXCEEDED_CODE = 2004

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
    }) as T
  }
  catch (error) {
    const { response, data } = error as FetchError<{ error?: { code?: number } }>
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

export async function routeAlongPaths(event: H3Event, from: LngLat, to: LngLat, sport: SportType): Promise<LngLatEle[]> {
  const result = await orsPost<{ features: { geometry: { coordinates: LngLatEle[] } }[] }>(
    event,
    `/v2/directions/${PROFILES[sport]}/geojson`,
    { coordinates: [from, to], elevation: true, instructions: false },
  )
  return result.features[0]!.geometry.coordinates
}

export async function elevationAlong(event: H3Event, coordinates: LngLat[]): Promise<LngLatEle[]> {
  const result = await orsPost<{ geometry: { coordinates: LngLatEle[] } }>(
    event,
    '/elevation/line',
    { format_in: 'polyline', format_out: 'geojson', geometry: coordinates },
  )
  return result.geometry.coordinates
}
