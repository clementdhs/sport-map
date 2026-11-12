import * as z from 'zod'
import { serverSupabaseClient } from '#supabase/server'

// Removes one of the caller's outings from a route. The route stays marked as done.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const routeId = getRouteIdParam(event)
  const outingId = getRouterParam(event, 'outingId')
  if (!z.uuid().safeParse(outingId).success) throw apiError(event, 404, 'api.outingNotFound')

  const supabase = await serverSupabaseClient(event)
  // RLS only lets users delete their own outings.
  const { data, error } = await supabase
    .from('route_outings')
    .delete()
    .eq('id', outingId!)
    .eq('route_id', routeId)
    .eq('user_id', user.sub)
    .select('id')
  if (error) {
    console.error('[DELETE /api/routes/:id/outings/:outingId]', error)
    throw apiError(event, 500, 'api.deleteOutingFailed')
  }
  if (!data.length) throw apiError(event, 404, 'api.outingNotFound')

  setResponseStatus(event, 204)
  return null
})
