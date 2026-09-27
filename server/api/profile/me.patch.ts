import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const { display_name, bio } = await readValidatedBody(event, body => profileUpdateSchema.parse(body))
  const supabase = await serverSupabaseClient(event)

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: display_name || null, bio: bio || null })
    .eq('id', user.sub)

  if (error) {
    console.error('[PATCH /api/profile/me]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de mettre à jour ton profil' })
  }
  setResponseStatus(event, 204)
  return null
})
