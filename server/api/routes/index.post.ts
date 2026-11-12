import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const body = await readLocalizedBody(event, routeCreateSchema)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await insertMaskedRoute(supabase, user.sub, routeDetailsFromPayload(body), trackFromPayload(body))
  if (error || !data) {
    console.error('[POST /api/routes]', error)
    throw apiError(event, 500, 'api.saveRouteFailed')
  }
  setResponseStatus(event, 201)
  return { id: data.id }
})
