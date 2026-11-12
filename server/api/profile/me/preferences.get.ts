import { serverSupabaseClient } from '#supabase/server'
import type { MyPreferences } from '#shared/types/account'

// The preferences kept in the caller's account (#145), loaded once per visit by the preferences store.
export default defineEventHandler(async (event): Promise<MyPreferences> => {
  const user = await requireUser(event)

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/profile/me/preferences]', error)
    throw apiError(event, 500, 'api.loadPreferencesFailed')
  }
  return (data?.preferences ?? {}) as MyPreferences
})
