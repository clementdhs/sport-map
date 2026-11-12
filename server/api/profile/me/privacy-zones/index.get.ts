import { serverSupabaseClient } from '#supabase/server'
import type { PrivacyZone } from '#shared/types/account'

export default defineEventHandler(async (event): Promise<PrivacyZone[]> => {
  const user = await requireUser(event)
  try {
    return await listPrivacyZones(await serverSupabaseClient(event), user.sub)
  }
  catch (error) {
    console.error('[GET /api/profile/me/privacy-zones]', error)
    throw apiError(event, 500, 'api.loadPrivacyZonesFailed')
  }
})
