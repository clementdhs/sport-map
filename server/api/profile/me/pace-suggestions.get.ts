import { serverSupabaseClient } from '#supabase/server'
import type { PaceSuggestions } from '#shared/types/account'
import type { PaceOuting } from '#shared/utils/pace'

// Outings read, latest first: enough for the latest ones of each sport (PACE_SUGGESTION_OUTINGS) once the short
// ones are left out.
const OUTINGS_READ = 200

// The caller's pace per sport from their latest GPS outings (#146), offered in the settings: they choose to keep
// it or not.
export default defineEventHandler(async (event): Promise<PaceSuggestions> => {
  const user = await requireUser(event)

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('route_outings')
    .select('moving_s, distance_m, has_track, route:routes(sport_type, distance_m, elevation_gain_m)')
    .eq('user_id', user.sub)
    .order('started_at', { ascending: false })
    .limit(OUTINGS_READ)

  if (error) {
    console.error('[GET /api/profile/me/pace-suggestions]', error)
    throw apiError(event, 500, 'api.loadPaceSuggestionsFailed')
  }
  // RLS hides a route its owner has since made private: its outings are left out.
  const outings: PaceOuting[] = data.flatMap(({ route, ...outing }) => route
    ? [{
        sport: route.sport_type,
        hasTrack: !!outing.has_track,
        distanceM: outing.distance_m,
        movingS: outing.moving_s,
        routeDistanceM: route.distance_m,
        routeGainM: route.elevation_gain_m,
      }]
    : [])
  return suggestPaces(outings)
})
