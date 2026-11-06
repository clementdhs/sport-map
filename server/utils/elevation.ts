import type { H3Event } from 'h3'
import type { FetchError } from 'ofetch'
import type { LngLat, LngLatEle } from '#shared/utils/routes'
import { type ElevationSources, measuredElevations, trackElevationsFrom } from '#shared/utils/trackElevation'

// The IGN answers this outside its coverage (France).
const IGN_NO_DATA = -9999

function elevationError(event: H3Event, service: string, error: unknown): Error {
  const { response, data } = error as FetchError
  if (response?.status === 429) return apiError(event, 429, 'api.elevationTooFast')
  console.error(`[${service}]`, response?.status, data ?? (error as Error).message)
  return apiError(event, 502, 'api.elevationUnavailable')
}

// IGN Géoplateforme altimetry (RGE ALTI): free, no key, Etalab licence, 5,000 points a request and 5 requests a
// second per IP address. POST: the points don't fit in a URL.
async function ignElevations(event: H3Event, points: LngLat[]): Promise<(number | null)[]> {
  const { ignAltimetryUrl } = useRuntimeConfig(event)
  try {
    const { elevations } = await $fetch<{ elevations: number[] }>(ignAltimetryUrl, {
      method: 'POST',
      body: {
        lon: points.map(([lng]) => lng).join('|'),
        lat: points.map(([, lat]) => lat).join('|'),
        delimiter: '|',
        resource: 'ign_rge_alti_wld',
        zonly: 'true',
      },
      timeout: 15_000,
    })
    if (elevations?.length !== points.length) throw new Error('Unexpected answer')
    return elevations.map(elevation => elevation > IGN_NO_DATA ? elevation : null)
  }
  catch (error) {
    throw elevationError(event, 'ign altimetry', error)
  }
}

// Open-Meteo (Copernicus 90 m model), for the points outside France: 100 a request, each counted as a call.
async function openMeteoElevations(event: H3Event, points: LngLat[]): Promise<number[]> {
  const { openMeteoElevationUrl } = useRuntimeConfig(event)
  try {
    const { elevation } = await $fetch<{ elevation: number[] }>(openMeteoElevationUrl, {
      query: {
        latitude: points.map(([, lat]) => lat).join(','),
        longitude: points.map(([lng]) => lng).join(','),
      },
      timeout: 8000,
    })
    if (elevation?.length !== points.length || !elevation.every(Number.isFinite)) throw new Error('Unexpected answer')
    return elevation
  }
  catch (error) {
    throw elevationError(event, 'open-meteo elevation', error)
  }
}


// Pause before asking the IGN again after a 429, randomized so that parallel requests don't come back together.
const IGN_RETRY_MS = 1000

// The IGN takes 5 requests a second per IP address, shared with other sites on Vercel, and the editor routes every
// segment at once when the sport changes (#176): a refused request is asked once more, so that neighbouring segments
// don't end up measured on different models (a step at each junction).
async function ignElevationsRetried(event: H3Event, points: LngLat[]): Promise<(number | null)[]> {
  try {
    return await ignElevations(event, points)
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 429) throw error
    await new Promise(resolve => setTimeout(resolve, IGN_RETRY_MS * (1 + Math.random())))
    return ignElevations(event, points)
  }
}

function elevationSources(event: H3Event): ElevationSources {
  return {
    precise: points => ignElevationsRetried(event, points),
    fallback: points => openMeteoElevations(event, points),
  }
}

// Elevations of a track that has none (#71), one per point: see shared/utils/trackElevation.ts.
export function trackElevations(event: H3Event, coordinates: LngLat[]): Promise<number[]> {
  return trackElevationsFrom(coordinates, elevationSources(event))
}

// A routed track (#176) with the IGN's elevations (Open-Meteo abroad) instead of OpenRouteService's, which it keeps
// when those services fail or are slow: see `measuredElevations`. Not counted in the routing quota.
export async function withMeasuredElevations(event: H3Event, points: LngLatEle[]): Promise<LngLatEle[]> {
  const elevations = await measuredElevations(points.map(([lng, lat]): LngLat => [lng, lat]), elevationSources(event))
  if (!elevations) {
    console.warn('[elevation] routed track of', points.length, 'points keeps OpenRouteService elevations')
    return points
  }
  return points.map(([lng, lat], i) => [lng, lat, elevations[i]!])
}