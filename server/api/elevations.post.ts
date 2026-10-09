import { serverSupabaseUser } from '#supabase/server'
import type { TrackElevationsResponse } from '#shared/types/osm'

// Elevations of a track imported into the editor without any (#71): an OpenStreetMap route, a GPX file without
// <ele>. IGN, then Open-Meteo outside France (server/utils/elevation.ts), not OpenRouteService, whose free elevation
// quota is 20 calls a day for the whole app.
export default defineEventHandler(async (event): Promise<TrackElevationsResponse> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const { coordinates } = await readLocalizedBody(event, trackElevationsSchema)
  return { elevations: await trackElevations(event, coordinates) }
})
