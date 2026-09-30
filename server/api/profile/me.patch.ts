import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const { display_name, bio } = await readLocalizedBody(event, profileUpdateSchema)
  const supabase = await serverSupabaseClient(event)

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: display_name || null, bio: bio || null })
    .eq('id', user.sub)

  if (error) {
    console.error('[PATCH /api/profile/me]', error)
    throw apiError(event, 500, 'api.updateProfileFailed')
  }
  setResponseStatus(event, 204)
  return null
})
