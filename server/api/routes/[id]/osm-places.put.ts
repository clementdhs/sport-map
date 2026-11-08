import { distance } from '@turf/turf'
import type { LineString } from 'geojson'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { RouteOsmPlaces } from '#shared/types/routes'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import type { MaskCircle } from '#shared/utils/privacyZones'
import type { LngLat } from '#shared/utils/routes'

// Saves the useful places the browser found near the route in OpenStreetMap (#52). Any member who can see the
// route may, as it is map data rather than the owner's content: RLS checks that the route is visible.
export default defineEventHandler(async (event): Promise<RouteOsmPlaces> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  // The service role below bypasses RLS, which asks members with two-factor authentication for their code.
  await requireMfa(event)

  const id = getRouteIdParam(event)
  const body = await readLocalizedBody(event, osmPlacesPayloadSchema)
  const supabase = await serverSupabaseClient(event)

  // A route cut by privacy zones (#254): the team only gets the places along the part it sees and outside the
  // owner's zones (a search near a cut point reaches into the zone). The owner searched along the full track.
  let places = body.places
  const { data: route } = await supabase.from('routes').select('owner_id, privacy_masked, geometry:route_geojson').eq('id', id).maybeSingle()
  if (route?.privacy_masked) {
    let circles: MaskCircle[]
    try {
      // The owner's zones are theirs only (RLS): read on the server, never sent back.
      circles = await loadMaskCircles(serverSupabaseServiceRole<Database>(event), route.owner_id)
    }
    catch (zonesError) {
      console.error('[PUT /api/routes/:id/osm-places] zones', zonesError)
      throw apiError(event, 500, 'api.saveOsmPlacesFailed')
    }
    const visible = (route.geometry as unknown as LineString).coordinates as LngLat[]
    places = places.filter(place => !insideZones(place.coordinates, circles)
      && distance(snapToTrack(visible, place.coordinates).coordinates, place.coordinates, { units: 'meters' }) <= OSM_PLACES_RADIUS_M)
  }

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
