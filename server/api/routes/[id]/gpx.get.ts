import type { LineString } from 'geojson'
import { serverSupabaseClient } from '#supabase/server'
import type { LngLat, Poi } from '#shared/utils/routes'

export default defineEventHandler(async (event) => {
  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('routes')
    .select(`name, description, sport_type, elevation_profile, pois, geometry:route_geojson, ${ORIGINAL_COLUMNS}`)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/routes/:id/gpx]', error)
    throw apiError(event, 500, 'api.exportRouteFailed')
  }
  // RLS hides private routes of other users.
  if (!data) throw apiError(event, 404, 'api.routeNotFound')

  // The owner exports the full track, the team what it sees (#254).
  const track = { ...data, ...data.original }
  const coordinates = (track.geometry as unknown as LineString).coordinates as LngLat[]
  const elevations = track.elevation_profile as number[] | null

  setResponseHeaders(event, {
    'Content-Type': 'application/gpx+xml; charset=utf-8',
    'Content-Disposition': `attachment; filename="${gpxFileName(data.name)}"`,
  })
  return buildGpx({
    name: data.name,
    description: data.description,
    type: data.sport_type,
    coordinates,
    elevations: elevations?.length === coordinates.length ? elevations : null,
    pois: track.pois as Poi[],
    locale: getRequestLocale(event),
  })
})
