import { serverSupabaseClient } from '#supabase/server'

// Renames a collection of the caller, or changes its description or visibility.
export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const id = getCollectionIdParam(event)
  const body = await readValidatedBody(event, data => collectionSchema.parse(data))
  const supabase = await serverSupabaseClient(event)

  // RLS only lets owners update: nothing updated means the collection is missing or not the caller's.
  const { data, error } = await supabase
    .from('collections')
    .update({ name: body.name, description: body.description || null, is_public: body.is_public })
    .eq('id', id)
    .select('id')
  if (error) {
    console.error('[PATCH /api/collections/:id]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de modifier la collection' })
  }
  if (!data.length) throw createError({ statusCode: 404, statusMessage: 'Collection introuvable' })
  return data[0]
})
