import { serverSupabaseClient } from '#supabase/server'

// Adds a route to a collection of the caller. Already there: nothing to do.
export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const collectionId = getCollectionIdParam(event)
  const routeId = getUuidParam(event, 'routeId', 'api.routeNotFound')
  const supabase = await serverSupabaseClient(event)

  const { error } = await supabase.from('collection_routes').insert({ collection_id: collectionId, route_id: routeId })
  // 23505: already in the collection.
  if (error && error.code !== '23505') {
    // RLS: not a collection of the caller, or a route they can't see.
    if (error.code === '42501') throw apiError(event, 404, 'api.collectionOrRouteNotFound')
    console.error('[PUT /api/collections/:id/routes/:routeId]', error)
    throw apiError(event, 500, 'api.addRouteFailed')
  }
  setResponseStatus(event, 204)
  return null
})
