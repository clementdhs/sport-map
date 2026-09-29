import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

// Deletes the caller's account (RGPD). Removing the auth user cascades to the profile, routes, photo rows,
// reviews (ratings recomputed by triggers), reports, activity and collections; photo files are removed
// first. Deleting an auth user takes the secret key.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  const { username } = await readValidatedBody(event, data => accountDeletionSchema.parse(data))

  const supabase = await serverSupabaseClient(event)
  const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.sub).single()
  if (profile?.username !== username) {
    throw createError({ statusCode: 400, statusMessage: "Le nom d'utilisateur saisi ne correspond pas" })
  }

  try {
    const admin = serverSupabaseServiceRole<Database>(event)
    await removeUserPhotoFiles(admin, user.sub)
    const { error } = await admin.auth.admin.deleteUser(user.sub)
    if (error) throw error
  }
  catch (error) {
    console.error('[DELETE /api/profile/me]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de supprimer le compte, réessaie plus tard' })
  }
  setResponseStatus(event, 204)
  return null
})
