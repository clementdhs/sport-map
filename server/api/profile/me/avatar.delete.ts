import { serverSupabaseClient } from '#supabase/server'

// Removes the caller's profile photo: their initials come back.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const supabase = await serverSupabaseClient(event)
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', user.sub)
  if (error) {
    console.error('[DELETE /api/profile/me/avatar]', error)
    throw apiError(event, 500, 'api.deleteAvatarFailed')
  }
  // The photo no longer shows: files left behind would only be removed with the account.
  try {
    await removeAvatarFiles(supabase, user.sub)
  }
  catch (removeError) {
    console.error('[DELETE /api/profile/me/avatar] could not remove the files', removeError)
  }
  setResponseStatus(event, 204)
  return null
})
