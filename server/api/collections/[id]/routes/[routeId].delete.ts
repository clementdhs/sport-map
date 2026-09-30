import { serverSupabaseClient } from '#supabase/server'

// Removes a route from a collection of the caller (the route itself stays).
export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const collectionId = getCollectionIdParam(event)
  const routeId = getUuidParam(event, 'routeId', 'api.routeNotFound')
  const supabase = await serverSupabaseClient(event)

  const { error } = await supabase
    .from('collection_routes')
    .delete()
    .eq('collection_id', collectionId)
    .eq('route_id', routeId)
  if (error) {
    console.error('[DELETE /api/collections/:id/routes/:routeId]', error)
    throw apiError(event, 500, 'api.removeRouteFailed')
  }
  setResponseStatus(event, 204)
  return null
})
