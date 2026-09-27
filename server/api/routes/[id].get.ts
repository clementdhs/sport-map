import type { LineString } from 'geojson'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { RouteDetail, ViewerActivity } from '#shared/types/routes'

export default defineEventHandler(async (event): Promise<RouteDetail> => {
  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('routes')
    .select(`
      id, name, description, sport_type, distance_m, elevation_gain_m, elevation_loss_m,
      is_public, source, created_at, owner_id, elevation_profile,
      geometry:route_geojson,
      owner:profiles(username, display_name)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/routes/:id]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de charger le parcours' })
  }
  // RLS hides private routes of other users: they are reported as missing too.
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })

  let viewer: ViewerActivity | null = null
  const user = await serverSupabaseUser(event)
  if (user) {
    const { data: activity } = await supabase
      .from('route_activity')
      .select('activity_type, completed_at')
      .eq('route_id', id)
      .eq('user_id', user.sub)
    viewer = {
      saved: !!activity?.some(a => a.activity_type === 'saved'),
      completed_at: activity?.find(a => a.activity_type === 'completed')?.completed_at ?? null,
    }
  }

  return {
    ...data,
    geometry: data.geometry as unknown as LineString,
    elevation_profile: data.elevation_profile as number[] | null,
    viewer,
  }
})
