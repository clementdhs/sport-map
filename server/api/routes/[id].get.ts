import type { LineString } from 'geojson'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { RouteDetail, ViewerActivity } from '#shared/types/routes'
import type { EditorState, Poi } from '#shared/utils/routes'

export default defineEventHandler(async (event): Promise<RouteDetail> => {
  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('routes')
    .select(`
      id, name, description, sport_type, distance_m, elevation_gain_m, elevation_loss_m,
      is_public, source, created_at, updated_at, owner_id, elevation_profile, editor_state, pois,
      rating_avg, rating_count,
      geometry:route_geojson,
      owner:profiles(username, display_name),
      photos:route_photos(id, storage_path)
    `)
    .eq('id', id)
    .order('created_at', { referencedTable: 'route_photos' })
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

  const { photos, ...route } = data
  return {
    ...route,
    geometry: data.geometry as unknown as LineString,
    elevation_profile: data.elevation_profile as number[] | null,
    editor_state: data.editor_state as EditorState | null,
    pois: data.pois as Poi[],
    photos: await signPhotos(supabase, photos),
    viewer,
  }
})
