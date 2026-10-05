import type { LineString } from 'geojson'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { RouteDetail, ViewerActivity } from '#shared/types/routes'
import type { EditorState, Poi, WayInfo } from '#shared/utils/routes'

export default defineEventHandler(async (event): Promise<RouteDetail> => {
  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)
  const user = await serverSupabaseUser(event)
  const { data, error } = await supabase
    .from('routes')
    .select(`
      id, name, description, sport_type, distance_m, elevation_gain_m, elevation_loss_m,
      is_public, source, created_at, updated_at, owner_id, elevation_profile, editor_state, pois, way_info,
      rating_avg, rating_count,
      geometry:route_geojson,
      owner:profiles(username, display_name),
      photos:route_photos(id, storage_path),
      outings:route_outings(id, user_id, started_at, duration_s, moving_s, distance_m, has_track, user:profiles(username, display_name))
    `)
    .eq('id', id)
    .order('created_at', { referencedTable: 'route_photos' })
    .order('started_at', { referencedTable: 'route_outings', ascending: false })
    .maybeSingle()

  if (error) {
    console.error('[GET /api/routes/:id]', error)
    throw apiError(event, 500, 'api.loadRouteFailed')
  }
  // RLS hides private routes of other users: they are reported as missing too.
  if (!data) throw apiError(event, 404, 'api.routeNotFound')

  let viewer: ViewerActivity | null = null
  if (user) {
    const { data: activity } = await supabase
      .from('route_activity')
      .select('activity_type, completed_at, duration_s, moving_s')
      .eq('route_id', id)
      .eq('user_id', user.sub)
    const completed = activity?.find(a => a.activity_type === 'completed')
    viewer = {
      saved: !!activity?.some(a => a.activity_type === 'saved'),
      completed_at: completed?.completed_at ?? null,
      duration_s: completed?.duration_s ?? null,
      moving_s: completed?.moving_s ?? null,
    }
  }

  const { photos, outings, ...route } = data
  return {
    ...route,
    // Typed by hand: inferring it here is circular for TypeScript.
    outings: outings.map(({ user_id: userId, ...outing }: typeof outings[number]) => ({ ...outing, is_mine: userId === user?.sub })),
    geometry: data.geometry as unknown as LineString,
    elevation_profile: data.elevation_profile as number[] | null,
    editor_state: data.editor_state as EditorState | null,
    pois: data.pois as Poi[],
    way_info: data.way_info as WayInfo | null,
    photos: await signPhotos(supabase, photos),
    viewer,
  }
})
