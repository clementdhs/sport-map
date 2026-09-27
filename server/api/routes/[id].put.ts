import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const id = getRouteIdParam(event)
  const body = await readValidatedBody(event, payload => routeCreateSchema.parse(payload))
  const supabase = await serverSupabaseClient(event)

  // RLS only lets owners update: nothing updated means the route is missing or not the caller's.
  const { data, error } = await supabase
    .from('routes')
    .update(routeRowFromPayload(body))
    .eq('id', id)
    .select('id')

  if (error) {
    console.error('[PUT /api/routes/:id]', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible d'enregistrer les modifications" })
  }
  if (!data.length) throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })
  return { id }
})
