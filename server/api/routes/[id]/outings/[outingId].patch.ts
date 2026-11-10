import * as z from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// How one of the caller's outings felt (#267), given on the coach's review after it; null takes it back.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const routeId = getRouteIdParam(event)
  const outingId = getRouterParam(event, 'outingId')
  if (!z.uuid().safeParse(outingId).success) throw apiError(event, 404, 'api.outingNotFound')
  const { feeling } = await readLocalizedBody(event, outingFeelingSchema)

  const supabase = await serverSupabaseClient(event)
  // RLS and the column grant only let members change the feeling of their own outings.
  const { data, error } = await supabase
    .from('route_outings')
    .update({ feeling })
    .eq('id', outingId!)
    .eq('route_id', routeId)
    .eq('user_id', user.sub)
    .select('id')
  if (error) {
    console.error('[PATCH /api/routes/:id/outings/:outingId]', error)
    throw apiError(event, 500, 'api.saveFeelingFailed')
  }
  if (!data.length) throw apiError(event, 404, 'api.outingNotFound')

  setResponseStatus(event, 204)
  return null
})
