import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const id = getRouteIdParam(event)
  const body = await readLocalizedBody(event, routeCreateSchema)
  const supabase = await serverSupabaseClient(event)

  // RLS only lets owners update: nothing updated means the route is missing or not the caller's.
  const { data, error } = await supabase
    .from('routes')
    .update(routeRowFromPayload(body))
    .eq('id', id)
    .select('id')

  if (error) {
    console.error('[PUT /api/routes/:id]', error)
    throw apiError(event, 500, 'api.saveChangesFailed')
  }
  if (!data.length) throw apiError(event, 404, 'api.routeNotFound')
  return { id }
})
