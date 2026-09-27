import type { LineString } from 'geojson'
import { serverSupabaseClient } from '#supabase/server'
import type { LngLat } from '#shared/utils/routes'

export default defineEventHandler(async (event) => {
  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('routes')
    .select('name, description, sport_type, elevation_profile, geometry:route_geojson')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/routes/:id/gpx]', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible d'exporter le parcours" })
  }
  // RLS hides private routes of other users.
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })

  const coordinates = (data.geometry as unknown as LineString).coordinates as LngLat[]
  const elevations = data.elevation_profile as number[] | null

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
  })
})
