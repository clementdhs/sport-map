import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

// Deletes the caller's account (RGPD). Removing the auth user cascades to the profile, routes, photo rows,
// reviews (ratings recomputed by triggers), reports, activity, collections and preferences; the files of the route
// photos and of the profile photo are removed first. Deleting an auth user takes the secret key.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  // The service role below bypasses RLS, which asks members with two-factor authentication for their code.
  await requireMfa(event)
  const { username } = await readLocalizedBody(event, accountDeletionSchema)

  const supabase = await serverSupabaseClient(event)
  const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.sub).single()
  if (profile?.username !== username) {
    throw apiError(event, 400, 'api.usernameMismatch')
  }

  try {
    const admin = serverSupabaseServiceRole<Database>(event)
    await removeUserPhotoFiles(admin, user.sub)
    await removeAvatarFiles(admin, user.sub)
    const { error } = await admin.auth.admin.deleteUser(user.sub)
    if (error) throw error
  }
  catch (error) {
    console.error('[DELETE /api/profile/me]', error)
    throw apiError(event, 500, 'api.deleteAccountFailed')
  }
  setResponseStatus(event, 204)
  return null
})
