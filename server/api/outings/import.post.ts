import { serverSupabaseClient } from '#supabase/server'
import type { OutingImportResponse } from '#shared/types/routes'

// One outing imported from a GPX, FIT or TCX file (#268), read in the browser: saved like an outing recorded in
// /record (`saveRecording`), unless the member already has an outing starting within IMPORT_SAME_START_S of it,
// on any route: the same file imported again, or the same outing recorded by the app and by a watch.
export default defineEventHandler(async (event): Promise<OutingImportResponse> => {
  const user = await requireUser(event)

  const body = await readLocalizedBody(event, recordingSchema)
  const supabase = await serverSupabaseClient(event)

  const existing = await sameStartOutingRoute(event, supabase, user.sub, body.started_at, 'POST /api/outings/import')
  if (existing) return { route_id: existing, duplicate: true }

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
