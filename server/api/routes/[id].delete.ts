import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)
  await removeRoutePhotoFiles(supabase, id)
  // RLS only lets owners delete: nothing deleted means the route is missing or not the caller's.
  const { data, error } = await supabase.from('routes').delete().eq('id', id).select('id')

  if (error) {
    console.error('[DELETE /api/routes/:id]', error)
    throw apiError(event, 500, 'api.deleteRouteFailed')
  }
  if (!data.length) throw apiError(event, 404, 'api.routeNotFound')
  setResponseStatus(event, 204)
  return null
})
