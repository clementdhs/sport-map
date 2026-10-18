import { serverSupabaseClient } from '#supabase/server'
import type { PublicProfile } from '#shared/types/routes'

export default defineEventHandler(async (event): Promise<PublicProfile> => {
  const username = getRouterParam(event, 'username') ?? ''
  const supabase = await serverSupabaseClient(event)

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, created_at, avatar_path')
    .eq('username', username)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/profile/:username]', error)
    throw apiError(event, 500, 'api.loadProfileFailed')
  }
  if (!profile) throw apiError(event, 404, 'api.profileNotFound')

  // Explicit is_public filter: RLS would also return the viewer's own private routes.
  const [{ data: routes, error: routesError }, summary] = await Promise.all([
    supabase
      .from('routes')
      .select(ROUTE_LIST_COLUMNS)
      .eq('owner_id', profile.id)
      .eq('is_public', true)
      .order('created_at', { ascending: false }),
    memberYearSummary(event, profile.id),
  ])

  // memberYearSummary logs its own error.
  if (routesError || !summary) {
    if (routesError) console.error('[GET /api/profile/:username]', routesError)
    throw apiError(event, 500, 'api.loadProfileFailed')
  }

  const { id: _id, ...info } = profile
  return { profile: info, summary, routes: routes.map(toRouteListItem) }
})
