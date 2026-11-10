import type { LineString } from 'geojson'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { RouteDetail, ViewerActivity } from '#shared/types/routes'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import type { EditorState, Poi, WayInfo } from '#shared/utils/routes'

export default defineEventHandler(async (event): Promise<RouteDetail> => {
  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)
  const user = await serverSupabaseUser(event)
  const { data, error } = await supabase
    .from('routes')
    .select(`
      id, name, description, sport_type, distance_m, elevation_gain_m, elevation_loss_m,
      is_public, is_loop, source, created_at, updated_at, owner_id, elevation_profile, editor_state, pois, way_info,
      rating_avg, rating_count, privacy_masked, privacy_hidden,
      geometry:route_geojson,
      ${ORIGINAL_COLUMNS},
      osm_places:route_osm_places(places, searched_at),
      owner:profiles(username, display_name, avatar_path),
      photos:route_photos(id, storage_path),
      outings:route_outings(id, user_id, started_at, duration_s, moving_s, distance_m, has_track, user:profiles(username, display_name), original:outing_originals(outing_id))
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

  // The full track for its owner (route_originals is theirs only); the team gets the routes row's visible part.
  const { photos, outings, osm_places: osmPlaces, original, ...stored } = data
  const route = { ...stored, ...original }
  return {
    ...route,
    // Typed by hand: inferring it here is circular for TypeScript.
    outings: outings.map(({ user_id: userId, original: outingOriginal, ...outing }: typeof outings[number]) => ({
      ...outing,
      // An outing entirely inside its recorder's zones keeps its points for them only.
      has_track: !!outing.has_track || !!outingOriginal,
      is_mine: userId === user?.sub,
    })),
    geometry: route.geometry as unknown as LineString,
    elevation_profile: route.elevation_profile as number[] | null,
    editor_state: route.editor_state as EditorState | null,
    pois: route.pois as Poi[],
    way_info: route.way_info as WayInfo | null,
    osm_places: osmPlaces ? { places: osmPlaces.places as OsmPlace[], searched_at: osmPlaces.searched_at } : null,
    photos: await signPhotos(supabase, photos),
    viewer,
  }
})
