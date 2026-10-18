import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { MyProfile } from '#shared/types/routes'

export default defineEventHandler(async (event): Promise<MyProfile> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const supabase = await serverSupabaseClient(event)
  const [profile, created, activity, outings] = await Promise.all([
    supabase.from('profiles').select('username, display_name, bio, created_at, avatar_path').eq('id', user.sub).single(),
    supabase.from('routes').select(ROUTE_LIST_COLUMNS).eq('owner_id', user.sub).order('created_at', { ascending: false }),
    supabase
      .from('route_activity')
      .select(`activity_type, completed_at, duration_s, moving_s, route:routes(${ROUTE_LIST_COLUMNS})`)
      .eq('user_id', user.sub)
      .order('created_at', { ascending: false }),
    supabase
      .from('route_outings')
      .select('route_id, started_at, duration_s, moving_s, route:routes(sport_type, distance_m, elevation_gain_m)')
      .eq('user_id', user.sub),
  ])

  if (!profile.data || !created.data || !activity.data || !outings.data) {
    console.error('[GET /api/profile/me]', profile.error ?? created.error ?? activity.error ?? outings.error)
    throw apiError(event, 500, 'api.loadOwnProfileFailed')
  }

  // A route its owner has since made private comes back without its route: skip it.
  const activities = activity.data.filter(a => a.route)
  const completed = activities
    .filter(a => a.activity_type === 'completed')
    .map(a => ({ ...toRouteListItem(a.route!), completed_at: a.completed_at!, duration_s: a.duration_s, moving_s: a.moving_s }))
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
  return {
    profile: profile.data,
    created: created.data.map(toRouteListItem),
    todo_count: activities.filter(a => a.activity_type === 'saved').length,
    completed,
    outings: statsOutings(
      outings.data.filter(o => o.route).map(o => ({
        ...o.route!,
        route_id: o.route_id,
        completed_at: outingEnd(o.started_at, o.duration_s),
        moving_s: o.moving_s,
      })),
      completed.map(route => ({
        route_id: route.id,
        sport_type: route.sport_type,
        distance_m: route.distance_m,
        elevation_gain_m: route.elevation_gain_m,
        completed_at: route.completed_at,
        moving_s: null,
      })),
    ),
  }
})
