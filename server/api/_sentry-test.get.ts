import { serverSupabaseUser } from '#supabase/server'

// Deliberate server error, to check that errors reach Sentry (see README). Signed-in users only, so that
// nobody else can use up the free quota.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  throw new Error('Test Sentry : erreur serveur volontaire')
})
