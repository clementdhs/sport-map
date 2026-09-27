import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)
  // RLS only lets owners delete: nothing deleted means the route is missing or not the caller's.
  const { data, error } = await supabase.from('routes').delete().eq('id', id).select('id')

  if (error) {
    console.error('[DELETE /api/routes/:id]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de supprimer le parcours' })
  }
  if (!data.length) throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })
  setResponseStatus(event, 204)
  return null
})
