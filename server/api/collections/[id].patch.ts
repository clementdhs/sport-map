import { serverSupabaseClient } from '#supabase/server'

// Renames a collection of the caller, or changes its description or visibility.
export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const id = getCollectionIdParam(event)
  const body = await readLocalizedBody(event, collectionSchema)
  const supabase = await serverSupabaseClient(event)

  // RLS only lets owners update: nothing updated means the collection is missing or not the caller's.
  const { data, error } = await supabase
    .from('collections')
    .update({ name: body.name, description: body.description || null, is_public: body.is_public })
    .eq('id', id)
    .select('id')
  if (error) {
    console.error('[PATCH /api/collections/:id]', error)
    throw apiError(event, 500, 'api.updateCollectionFailed')
  }
  if (!data.length) throw apiError(event, 404, 'api.collectionNotFound')
  return data[0]
})
