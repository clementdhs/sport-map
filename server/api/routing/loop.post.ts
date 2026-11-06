import { serverSupabaseUser } from '#supabase/server'
import type { RoutingLoopResponse } from '#shared/utils/routes'
import type { LoopTry } from '#shared/utils/loops'

// One proposal of automatic loop (#50): asked again with a corrected length until it is within the tolerance,
// each OpenRouteService call counting in the user's routing quota. Only the accepted loop gets measured elevations
// (#176), which don't count in the quota.
export default defineEventHandler(async (event): Promise<RoutingLoopResponse> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const { start, length_m, sport_type, seed } = await readLocalizedBody(event, routingLoopSchema)

  const tries: LoopTry[] = []
  while (tries.length < LOOP_ATTEMPTS) {
    const remaining = await consumeRoutingQuota(event)
    const requestedM = nextLoopLength(length_m, tries)
    let loop
    try {
      loop = await roundTrip(event, start, requestedM, sport_type, seed)
    }
    catch (error) {
      if (error instanceof NoRouteFoundError) throw apiError(event, 422, 'api.loopNotFound')
      throw error
    }
    if (isOnTarget(loop.lengthM, length_m)) {
      return {
        ...trackFields(await withMeasuredElevations(event, loop.points)),
        ...(loop.wayInfo ? { way_info: loop.wayInfo } : {}),
        quota_remaining: remaining,
      }
    }
    tries.push({ requestedM, lengthM: loop.lengthM })
  }
  throw apiError(event, 422, 'api.loopOffTarget')
})
