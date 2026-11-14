import { serverSupabaseClient } from '#supabase/server'

// Saves an outing recorded while following a route (`saveRouteOuting`): listed on the route's page with the
// others, and the route is marked as completed with its times and leaves the "À faire" list.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const routeId = getRouteIdParam(event)
  const body = await readLocalizedBody(event, outingSchema)
  const supabase = await serverSupabaseClient(event)

  // RLS hides private routes of other users: they are reported as missing.
  const { data: route, error: routeError } = await supabase.from('routes').select('id').eq('id', routeId).maybeSingle()
  if (routeError) {
    console.error('[POST /api/routes/:id/outings] route', routeError)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }
  if (!route) throw apiError(event, 404, 'api.routeNotFound')

  const id = await saveRouteOuting(event, supabase, user.sub, routeId, body, 'POST /api/routes/:id/outings')
  setResponseStatus(event, 201)
  return { id }
})
