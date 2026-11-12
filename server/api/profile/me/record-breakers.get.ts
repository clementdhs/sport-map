import { serverSupabaseClient } from '#supabase/server'
import type { RecordBreakers } from '#shared/types/routes'

// The member's GPS outings that beat one of their records when recorded (#140), for the "Record !" badge of a
// route page's Passages tab. Counted from the same outings as their statistics and records.
export default defineEventHandler(async (event): Promise<RecordBreakers> => {
  const user = await requireUser(event)

  const supabase = await serverSupabaseClient(event)
  const [recorded, done] = await Promise.all([
    ownRecordedOutings(supabase, user.sub),
    supabase
      .from('route_activity')
      .select('route_id, completed_at, route:routes(name, sport_type, distance_m, elevation_gain_m)')
      .eq('user_id', user.sub)
      .eq('activity_type', 'completed'),
  ])
  if (!recorded || !done.data) {
    console.error('[GET /api/profile/me/record-breakers]', done.error)
    throw apiError(event, 500, 'api.loadOwnProfileFailed')
  }

  return recordBreakers(statsOutings(
    recorded,
    done.data.filter(a => a.route && a.completed_at).map(({ route, ...activity }) => doneRecordOuting({
      route_id: activity.route_id,
      route_name: route!.name,
      sport_type: route!.sport_type,
      distance_m: route!.distance_m,
      elevation_gain_m: route!.elevation_gain_m,
      completed_at: activity.completed_at!,
    })),
  ))
})
