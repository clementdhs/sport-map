import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { MyProfile } from '#shared/types/routes'

export default defineEventHandler(async (event): Promise<MyProfile> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const supabase = await serverSupabaseClient(event)
  const [profile, created, activity] = await Promise.all([
    supabase.from('profiles').select('username, display_name, bio, created_at').eq('id', user.sub).single(),
    supabase.from('routes').select(ROUTE_LIST_COLUMNS).eq('owner_id', user.sub).order('created_at', { ascending: false }),
    supabase
      .from('route_activity')
      .select(`activity_type, completed_at, route:routes(${ROUTE_LIST_COLUMNS})`)
      .eq('user_id', user.sub)
      .order('created_at', { ascending: false }),
  ])

  if (!profile.data || !created.data || !activity.data) {
    console.error('[GET /api/profile/me]', profile.error ?? created.error ?? activity.error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de charger ton profil' })
  }

  // A saved route its owner has since made private comes back without its route: skip it.
  const activities = activity.data.filter(a => a.route)
  return {
    profile: profile.data,
    created: created.data.map(toRouteListItem),
    saved: activities.filter(a => a.activity_type === 'saved').map(a => toRouteListItem(a.route!)),
    completed: activities
      .filter(a => a.activity_type === 'completed')
      .map(a => ({ ...toRouteListItem(a.route!), completed_at: a.completed_at! }))
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at)),
  }
})
