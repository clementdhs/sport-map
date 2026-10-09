import { serverSupabaseClient } from '#supabase/server'
import type { OsmRouteElevation } from '#shared/types/osm'
import type { Database } from '#shared/types/database.types'

// What is already known of the marked routes found on the discover page (#71), whatever their version: the page
// compares it to the version it has. A POST only to send a few hundred ids.
export default defineEventHandler(async (event): Promise<OsmRouteElevation[]> => {
  const { ids } = await readLocalizedBody(event, osmElevationLookupSchema)
  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('osm_route_elevations')
    .select('relation_id, version, distance_m, gain_m, loss_m')
    .in('relation_id', ids)
  if (error) {
    console.error('[osm elevations]', error)
    throw apiError(event, 500, 'api.elevationUnavailable')
  }
  return data
})
