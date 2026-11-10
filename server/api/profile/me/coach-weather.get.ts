import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { CoachWeather } from '#shared/types/account'
import type { Database } from '#shared/types/database.types'
import { coachWeatherQuerySchema, type StartPlace, usualStart } from '#shared/utils/weatherSlot'

// Outings looked at for the usual start, newest first
const RECENT_OUTINGS = 20
// Forecast days sent: today, and tomorrow for a page left open past midnight
const DAYS = 2

// The hourly forecast for the best slot of the coach's session (#265): at the member's position when the browser
// gives it (rounded to 0.01°), else at the start of their recent outings (usualStart), else of their latest
// routes. null without any.
export default defineEventHandler(async (event): Promise<CoachWeather | null> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  const { lat, lng } = getLocalizedQuery(event, coachWeatherQuerySchema)

  let place: StartPlace | null = null
  if (lat !== undefined && lng !== undefined) {
    place = { lat, lng, elevation: null }
  }
  else {
    const supabase = await serverSupabaseClient(event)
    place = usualStart(await recentStarts(supabase, user.sub))
  }
  if (!place) return null

  let forecast: Awaited<ReturnType<typeof forecastAt>>
  try {
    forecast = await forecastAt(roundCoordinate(place.lat), roundCoordinate(place.lng), place.elevation)
  }
  catch (err) {
    console.error('[GET /api/profile/me/coach-weather] Open-Meteo', err)
    throw apiError(event, 503, 'api.weatherUnavailable')
  }

  const { hourly, daily } = forecast
  const lastDay = daily?.time[DAYS - 1] ?? hourly.time[0]?.slice(0, 10) ?? ''
  setResponseHeaders(event, { 'Cache-Control': 'private, max-age=1800' })
  return {
    utcOffsetSeconds: forecast.utc_offset_seconds,
    hours: hourly.time.flatMap((time, i) => (time.slice(0, 10) > lastDay
      ? []
      : [{ time, temperature: hourly.temperature_2m[i]!, precipitationMm: hourly.precipitation[i]!, windKmh: hourly.wind_speed_10m[i]! }])),
    daylight: (daily?.time ?? []).slice(0, DAYS).map((date, i) => ({ date, sunrise: daily!.sunrise[i]!, sunset: daily!.sunset[i]! })),
  }
})

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

// The starts of the routes of the member's recent outings, newest first (one per outing), else of their latest
// routes. Each with its route's first elevation, as its route page asks the forecast for.
async function recentStarts(supabase: Supabase, userId: string): Promise<StartPlace[]> {
  const { data: outings, error } = await supabase
    .from('route_outings')
    .select('route_id')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(RECENT_OUTINGS)
  if (error) console.error('[GET /api/profile/me/coach-weather] outings', error)
  let routeIds = (outings ?? []).map(outing => outing.route_id)
  if (!routeIds.length) {
    const { data: routes } = await supabase
      .from('routes')
      .select('id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(RECENT_OUTINGS)
    routeIds = (routes ?? []).map(route => route.id)
  }
  if (!routeIds.length) return []

  // RLS: routes the member can still see.
  const { data: routes, error: routesError } = await supabase
    .from('routes')
    .select('id, start_point, elevation_profile')
    .in('id', [...new Set(routeIds)])
  if (routesError) console.error('[GET /api/profile/me/coach-weather] routes', routesError)
  const starts = new Map((routes ?? []).flatMap((route) => {
    const point = pointFromWkb(route.start_point)
    if (!point) return []
    const elevations = route.elevation_profile as number[] | null
    return [[route.id, { lng: point[0], lat: point[1], elevation: elevations?.length ? Math.round(elevations[0]!) : null }]] as const
  }))
  return routeIds.flatMap(id => starts.get(id) ?? [])
}
