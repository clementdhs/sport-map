import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { PrivacyZonesResult } from '#shared/types/account'

// Cuts the member's routes and outings again with their zones (#254), when an earlier change couldn't do it all.
export default defineEventHandler(async (event): Promise<PrivacyZonesResult> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  return await privacyZonesResult(event, await serverSupabaseClient(event), user.sub)
})
