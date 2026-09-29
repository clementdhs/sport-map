import { serverSupabaseClient } from '#supabase/server'

// Deletes a collection of the caller (its routes stay: only the links go).
export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const id = getCollectionIdParam(event)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase.from('collections').delete().eq('id', id).select('id')
  if (error) {
    console.error('[DELETE /api/collections/:id]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de supprimer la collection' })
  }
  if (!data.length) throw createError({ statusCode: 404, statusMessage: 'Collection introuvable' })
  setResponseStatus(event, 204)
  return null
})
