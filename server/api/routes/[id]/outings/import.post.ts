import type { LineString } from 'geojson'
import { serverSupabaseClient } from '#supabase/server'
import type { OutingImportResponse } from '#shared/types/routes'
import type { LngLat } from '#shared/utils/routes'

// An outing from a watch's GPX, FIT or TCX file imported on a route (#138), read in the browser like the ones
// imported from the profile (#268). It is saved on this route like one recorded while following it
// (`saveRouteOuting`), only when it was done on it (`outingFollowsRoute`), and skipped when the member already has
// an outing starting at the same time, on any route.
export default defineEventHandler(async (event): Promise<OutingImportResponse> => {
  const user = await requireUser(event)

  const routeId = getRouteIdParam(event)
  const body = await readLocalizedBody(event, outingImportSchema)
  const supabase = await serverSupabaseClient(event)
  const tag = 'POST /api/routes/:id/outings/import'

  // RLS hides private routes of other users: they are reported as missing. The owner compares with the full
  // track, the team with what it sees of it (#254).
  const { data: route, error: routeError } = await supabase
    .from('routes')
    .select('geometry:route_geojson, original:route_originals(geometry:route_original_geojson)')
    .eq('id', routeId)
    .maybeSingle()
  if (routeError) {
    console.error(`[${tag}] route`, routeError)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }
  if (!route) throw apiError(event, 404, 'api.routeNotFound')

  const existing = await sameStartOutingRoute(event, supabase, user.sub, body.started_at, tag)
  if (existing) return { route_id: existing, duplicate: true }

  const geometry = (route.original?.geometry ?? route.geometry) as unknown as LineString
  const outing = body.track.map(([lng, lat]): LngLat => [lng, lat])
  if (!outingFollowsRoute(outing, geometry.coordinates as LngLat[])) throw apiError(event, 422, 'api.outingOffRoute')

  await saveRouteOuting(event, supabase, user.sub, routeId, body, tag)
  setResponseStatus(event, 201)
  return { route_id: routeId, duplicate: false }
})
