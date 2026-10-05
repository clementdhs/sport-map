import { serverSupabaseUser } from '#supabase/server'
import type { RoutingSegmentResponse, WayInfo } from '#shared/utils/routes'

export default defineEventHandler(async (event): Promise<RoutingSegmentResponse> => {
  // Signed-in users only: the OpenRouteService quota is shared by the whole app.
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const { from, to, mode, sport_type } = await readLocalizedBody(event, routingSegmentSchema)
  const remaining = await consumeRoutingQuota(event)

  let points = null
  let wayInfo: WayInfo | null = null
  let snapped = mode === 'snap'
  if (snapped) {
    try {
      ({ points, wayInfo } = await routeAlongPaths(event, from, to, sport_type))
    }
    catch (error) {
      if (!(error instanceof NoRouteFoundError)) throw error
      snapped = false
    }
  }
  points ??= await elevationAlong(event, sampleStraightLine(from, to))

  return {
    ...trackFields(points),
    snapped,
    ...(wayInfo ? { way_info: wayInfo } : {}),
    quota_remaining: remaining,
  }
})
