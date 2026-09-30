import type { LineString } from 'geojson'
import { serverSupabaseClient } from '#supabase/server'
import type { RouteWeather } from '#shared/types/routes'
import type { LngLat } from '#shared/utils/routes'
import type { OpenMeteoHourly } from '#shared/utils/weather'

interface OpenMeteoResponse {
  utc_offset_seconds: number
  elevation: number
  hourly: OpenMeteoHourly
}

// Forecasts are shared between routes starting within ~1 km of each other and kept for an hour: Open-Meteo's
// free API allows 10,000 calls a day. Rounding also keeps the exact start of private routes to ourselves.
const forecastAt = defineCachedFunction(
  async (lat: number, lng: number, elevation: number | null): Promise<OpenMeteoResponse> => $fetch<OpenMeteoResponse>(
    useRuntimeConfig().openMeteoUrl,
    {
      query: {
        latitude: lat,
        longitude: lng,
        // The start's elevation, rather than the model's: temperatures differ a lot in the mountains.
        ...(elevation === null ? {} : { elevation }),
        hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m',
        timezone: 'auto',
        forecast_days: 4,
      },
      timeout: 8000,
    },
  ),
  { name: 'open-meteo', maxAge: 3600, getKey: (lat: number, lng: number, elevation: number | null) => `${lat},${lng},${elevation}` },
)

// Weather at the start of a route over the next 3 days, by half-day.
export default defineEventHandler(async (event): Promise<RouteWeather> => {
  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)
  // RLS: private routes only for their owner.
  const { data, error } = await supabase
    .from('routes')
    .select('elevation_profile, geometry:route_geojson')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[GET /api/routes/:id/weather]', error)
    throw apiError(event, 500, 'api.loadRouteFailed')
  }
  if (!data) throw apiError(event, 404, 'api.routeNotFound')

  const [lng, lat] = (data.geometry as unknown as LineString).coordinates[0] as LngLat
  const elevations = data.elevation_profile as number[] | null
  const elevation = elevations?.length ? Math.round(elevations[0]!) : null
  const round2 = (value: number) => Math.round(value * 100) / 100

  let forecast: OpenMeteoResponse
  try {
    forecast = await forecastAt(round2(lat), round2(lng), elevation)
  }
  catch (err) {
    console.error('[GET /api/routes/:id/weather] Open-Meteo', err)
    throw apiError(event, 503, 'api.weatherUnavailable')
  }

  const nowLocal = localTime(new Date(), forecast.utc_offset_seconds)
  setResponseHeaders(event, { 'Cache-Control': 'private, max-age=1800' })
  return {
    today: nowLocal.slice(0, 10),
    elevationM: elevation,
    halfDays: halfDayForecasts(forecast.hourly, nowLocal, WEATHER_HALF_DAY_COUNT),
  }
})
