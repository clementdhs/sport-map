import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const { username, display_name, bio } = await readLocalizedBody(event, profileUpdateSchema)
  const supabase = await serverSupabaseClient(event)

  const { error } = await supabase
    .from('profiles')
    .update({ username, display_name: display_name || null, bio: bio || null })
    .eq('id', user.sub)

  if (error) {
    // Taken by another member, whatever its case (unique index on lower(username)).
    if (error.code === '23505') throw apiError(event, 409, 'api.usernameTaken')
    console.error('[PATCH /api/profile/me]', error)
    throw apiError(event, 500, 'api.updateProfileFailed')
  }
  setResponseStatus(event, 204)
  return null
})
