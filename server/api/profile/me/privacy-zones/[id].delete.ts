import * as z from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { PrivacyZonesResult } from '#shared/types/account'

// Removes a privacy zone (#254), then cuts the member's routes and outings again without it.
export default defineEventHandler(async (event): Promise<PrivacyZonesResult> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  const id = getRouterParam(event, 'id')
  if (!z.uuid().safeParse(id).success) throw apiError(event, 404, 'api.privacyZoneNotFound')
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase.from('privacy_zones').delete().eq('id', id!).eq('owner_id', user.sub).select('id')
  if (error) {
    console.error('[DELETE /api/profile/me/privacy-zones/:id]', error)
    throw apiError(event, 500, 'api.savePrivacyZoneFailed')
  }
  if (!data.length) throw apiError(event, 404, 'api.privacyZoneNotFound')

  return await privacyZonesResult(event, supabase, user.sub)
})
