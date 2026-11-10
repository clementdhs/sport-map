import type { LineString } from 'geojson'
import { serverSupabaseClient } from '#supabase/server'
import type { RouteWeather } from '#shared/types/routes'
import type { LngLat } from '#shared/utils/routes'

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

  let forecast: Awaited<ReturnType<typeof forecastAt>>
  try {
    forecast = await forecastAt(roundCoordinate(lat), roundCoordinate(lng), elevation)
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
