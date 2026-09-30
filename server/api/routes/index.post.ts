import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const body = await readLocalizedBody(event, routeCreateSchema)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('routes')
    .insert({ owner_id: user.sub, ...routeRowFromPayload(body) })
    .select('id')
    .single()

  if (error) {
    console.error('[POST /api/routes]', error)
    throw apiError(event, 500, 'api.saveRouteFailed')
  }
  setResponseStatus(event, 201)
  return data
})
