import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { RouteOsmPlaces } from '#shared/types/routes'
import type { OsmPlace } from '#shared/utils/osmPlaces'

// Saves the useful places the browser found near the route in OpenStreetMap (#52). Any member who can see the
// route may, as it is map data rather than the owner's content: RLS checks that the route is visible.
export default defineEventHandler(async (event): Promise<RouteOsmPlaces> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const id = getRouteIdParam(event)
  const { places } = await readLocalizedBody(event, osmPlacesPayloadSchema)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('route_osm_places')
    .upsert({ route_id: id, places, searched_at: new Date().toISOString() })
    .select('places, searched_at')
    .single()

  if (error) {
    // 42501: refused by RLS, the route is someone else's private one; 23503: no such route.
    if (error.code === '42501' || error.code === '23503') throw apiError(event, 404, 'api.routeNotFound')
    console.error('[PUT /api/routes/:id/osm-places]', error)
    throw apiError(event, 500, 'api.saveOsmPlacesFailed')
  }
  return { places: data.places as OsmPlace[], searched_at: data.searched_at }
})
