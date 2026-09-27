import { serverSupabaseClient } from '#supabase/server'
import type { PublicProfile } from '#shared/types/routes'

export default defineEventHandler(async (event): Promise<PublicProfile> => {
  const username = getRouterParam(event, 'username') ?? ''
  const supabase = await serverSupabaseClient(event)

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, created_at')
    .eq('username', username)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/profile/:username]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de charger le profil' })
  }
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profil introuvable' })

  // Explicit is_public filter: RLS would also return the viewer's own private routes.
  const { data: routes, error: routesError } = await supabase
    .from('routes')
    .select(ROUTE_LIST_COLUMNS)
    .eq('owner_id', profile.id)
    .eq('is_public', true)
    .order('created_at', { ascending: false })

  if (routesError) {
    console.error('[GET /api/profile/:username]', routesError)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de charger le profil' })
  }

  const { id: _id, ...info } = profile
  return { profile: info, routes: routes.map(toRouteListItem) }
})
