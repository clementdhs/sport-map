import { serverSupabaseClient } from '#supabase/server'

// Deletes a collection of the caller (its routes stay: only the links go).
export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const id = getCollectionIdParam(event)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase.from('collections').delete().eq('id', id).select('id')
  if (error) {
    console.error('[DELETE /api/collections/:id]', error)
    throw apiError(event, 500, 'api.deleteCollectionFailed')
  }
  if (!data.length) throw apiError(event, 404, 'api.collectionNotFound')
  setResponseStatus(event, 204)
  return null
})
