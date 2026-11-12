import type { TrackElevationsResponse } from '#shared/types/osm'

// Elevations of a track imported into the editor without any (#71): an OpenStreetMap route, a GPX file without
// <ele>. IGN, then Open-Meteo outside France (server/utils/elevation.ts), not OpenRouteService, whose free elevation
// quota is 20 calls a day for the whole app.
export default defineEventHandler(async (event): Promise<TrackElevationsResponse> => {
  const user = await requireUser(event)

  const { coordinates } = await readLocalizedBody(event, trackElevationsSchema)
  return { elevations: await trackElevations(event, coordinates) }
})
