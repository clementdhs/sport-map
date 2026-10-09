import type { H3Event } from 'h3'
import type { FetchError } from 'ofetch'
import type { LngLat } from '#shared/utils/routes'

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

// Elevations of a track that has none (#71), one per point: see shared/utils/trackElevation.ts.
export function trackElevations(event: H3Event, coordinates: LngLat[]): Promise<number[]> {
  return trackElevationsFrom(coordinates, {
    precise: points => ignElevations(event, points),
    fallback: points => openMeteoElevations(event, points),
  })
}
