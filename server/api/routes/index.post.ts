import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const body = await readValidatedBody(event, payload => routeCreateSchema.parse(payload))
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('routes')
    .insert({ owner_id: user.sub, ...routeRowFromPayload(body) })
    .select('id')
    .single()

  if (error) {
    console.error('[POST /api/routes]', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible d'enregistrer le parcours" })
  }
  setResponseStatus(event, 201)
  return data
})
