import { length, lineString } from '@turf/turf'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { OsmRouteElevation } from '#shared/types/osm'
import type { Database } from '#shared/types/database.types'

// Elevation gain and loss of a marked route (#71), computed from the points its import into the editor would have,
// so that both show the same figure, then kept for the family until the relation changes (a new version).
export default defineEventHandler(async (event): Promise<OsmRouteElevation> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  // The service role below bypasses RLS, which asks members with two-factor authentication for their code.
  await requireMfa(event)

  const { relation_id, version, coordinates } = await readLocalizedBody(event, osmElevationComputeSchema)

  // Already computed for this version, by another member or another tab: no new call.
  const supabase = await serverSupabaseClient<Database>(event)
  const { data: known } = await supabase
    .from('osm_route_elevations')
    .select('relation_id, version, distance_m, gain_m, loss_m')
    .eq('relation_id', relation_id)
    .eq('version', version)
    .maybeSingle()
  if (known) return known

  const elevations = await trackElevations(event, coordinates)
  const { gain, loss } = elevationStats(coordinates, elevations)
  const row: OsmRouteElevation = {
    relation_id,
    version,
    distance_m: Math.round(length(lineString(coordinates), { units: 'meters' })),
    gain_m: Math.round(gain),
    loss_m: Math.round(loss),
  }

  // Shared data no member owns: only the server writes it. Not kept, the gain is still right: it is only computed
  // again next time.
  try {
    const { error } = await serverSupabaseServiceRole<Database>(event)
      .from('osm_route_elevations')
      .upsert({ ...row, computed_at: new Date().toISOString() })
    if (error) throw error
  }
  catch (error) {
    console.error('[osm elevations] not cached', error)
  }
  return row
})
