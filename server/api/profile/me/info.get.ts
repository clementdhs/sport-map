import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { ProfileInfo } from '#shared/types/routes'

// The profile alone, without the route lists of GET /api/profile/me: for the settings page.
export default defineEventHandler(async (event): Promise<ProfileInfo> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('profiles')
    .select('username, display_name, bio, created_at')
    .eq('id', user.sub)
    .single()

  if (!data) {
    console.error('[GET /api/profile/me/info]', error)
    throw apiError(event, 500, 'api.loadOwnProfileFailed')
  }
  return data
})
