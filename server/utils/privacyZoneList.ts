import type { serverSupabaseClient } from '#supabase/server'
import type { H3Event } from 'h3'
import type { PrivacyZone, PrivacyZonesResult } from '#shared/types/account'
import type { Database } from '#shared/types/database.types'

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

// The caller's privacy zones (#254) as they placed them, oldest first; throws when they can't be read.
export async function listPrivacyZones(supabase: Supabase, userId: string): Promise<PrivacyZone[]> {
  const { data, error } = await supabase
    .from('privacy_zones')
    .select('id, label, lng, lat, radius_m')
    .eq('owner_id', userId)
    .order('created_at')
  if (error) throw error
  return data.map(zone => ({ id: zone.id, label: zone.label, center: [zone.lng, zone.lat], radius_m: zone.radius_m }))
}

// A number in [0, 1) from the system's secure generator: the moved centre must not be guessable.
export function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32
}

// After a change of zones: every route and outing cut again, and the zones as they now are.
export async function privacyZonesResult(event: H3Event, supabase: Supabase, userId: string): Promise<PrivacyZonesResult> {
  let applied = false
  try {
    applied = await applyPrivacyZones(supabase, userId)
  }
  catch (error) {
    console.error('[applyPrivacyZones]', error)
  }
  try {
    return { zones: await listPrivacyZones(supabase, userId), applied }
  }
  catch (error) {
    console.error('[privacyZonesResult]', error)
    throw apiError(event, 500, 'api.loadPrivacyZonesFailed')
  }
}
