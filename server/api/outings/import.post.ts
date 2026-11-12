import { serverSupabaseClient } from '#supabase/server'
import type { OutingImportResponse } from '#shared/types/routes'

// One outing imported from a GPX, FIT or TCX file (#268), read in the browser: saved like an outing recorded in
// /record (`saveRecording`), unless the member already has an outing starting within IMPORT_SAME_START_S of it,
// on any route: the same file imported again, or the same outing recorded by the app and by a watch.
export default defineEventHandler(async (event): Promise<OutingImportResponse> => {
  const user = await requireUser(event)

  const body = await readLocalizedBody(event, recordingSchema)
  const supabase = await serverSupabaseClient(event)

  const start = Date.parse(body.started_at)
  const { data: existing, error } = await supabase
    .from('route_outings')
    .select('route_id')
    .eq('user_id', user.sub)
    .gte('started_at', new Date(start - IMPORT_SAME_START_S * 1000).toISOString())
    .lte('started_at', new Date(start + IMPORT_SAME_START_S * 1000).toISOString())
    .limit(1)
  if (error) {
    console.error('[POST /api/outings/import] existing', error)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }
  if (existing[0]) return { route_id: existing[0].route_id, duplicate: true }

  // A file without altitudes (a phone app's GPX) gets them like a GPX imported into the editor (#71), so that its
  // gain counts in the statistics and the coach's load; without an answer, the route has no elevations.
  let route = body.route
  if (!route.elevations) {
    try {
      route = { ...route, elevations: await trackElevations(event, route.coordinates) }
    }
    catch (elevationError) {
      console.warn('[POST /api/outings/import] elevations', elevationError)
    }
  }

  const { routeId } = await saveRecording(event, supabase, user.sub, { ...body, route }, 'POST /api/outings/import')
  setResponseStatus(event, 201)
  return { route_id: routeId, duplicate: false }
})
