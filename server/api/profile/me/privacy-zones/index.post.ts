import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { PrivacyZonesResult } from '#shared/types/account'

// Adds a privacy zone (#254), its cutting circle moved at random from the place picked, then cuts the member's
// routes and outings again.
export default defineEventHandler(async (event): Promise<PrivacyZonesResult> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  const body = await readLocalizedBody(event, privacyZoneSchema)
  const supabase = await serverSupabaseClient(event)

  const { count, error: countError } = await supabase
    .from('privacy_zones')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.sub)
  if (countError) {
    console.error('[POST /api/profile/me/privacy-zones] count', countError)
    throw apiError(event, 500, 'api.savePrivacyZoneFailed')
  }
  if ((count ?? 0) >= MAX_PRIVACY_ZONES) throw apiError(event, 400, 'api.tooManyPrivacyZones')

  const [lng, lat] = body.center
  const [maskLng, maskLat] = offsetCenter(body.center, body.radius_m, secureRandom)
  const { error } = await supabase.from('privacy_zones').insert({
    owner_id: user.sub,
    label: body.label || null,
    lng,
    lat,
    mask_lng: maskLng,
    mask_lat: maskLat,
    radius_m: body.radius_m,
  })
  if (error) {
    console.error('[POST /api/profile/me/privacy-zones]', error)
    throw apiError(event, 500, 'api.savePrivacyZoneFailed')
  }

  setResponseStatus(event, 201)
  return await privacyZonesResult(event, supabase, user.sub)
})
