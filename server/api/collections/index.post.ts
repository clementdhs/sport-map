import { serverSupabaseClient } from '#supabase/server'

// Creates a collection of the caller, holding the given route when created from a route page.
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const body = await readValidatedBody(event, data => collectionCreateSchema.parse(data))
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('collections')
    .insert({ owner_id: userId, name: body.name, description: body.description || null, is_public: body.is_public })
    .select('id')
    .single()
  if (error) {
    console.error('[POST /api/collections]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de créer la collection' })
  }

  if (body.route_id) {
    const added = await supabase.from('collection_routes').insert({ collection_id: data.id, route_id: body.route_id })
    // RLS: the route must be one the caller can see.
    if (added.error) console.error('[POST /api/collections] route', added.error)
  }
  setResponseStatus(event, 201)
  return data
})
