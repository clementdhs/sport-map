import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { RoutingSegmentResponse } from '#shared/utils/routes'

const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const round1 = (value: number) => Math.round(value * 10) / 10

export default defineEventHandler(async (event): Promise<RoutingSegmentResponse> => {
  // Signed-in users only: the OpenRouteService quota is shared by the whole app.
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const { from, to, mode, sport_type } = await readValidatedBody(event, body => routingSegmentSchema.parse(body))

  // Counted before calling OpenRouteService, failed calls included: a loop of bad requests costs too.
  const { routingDailyLimit } = useRuntimeConfig(event)
  const supabase = await serverSupabaseClient(event)
  const { data: remaining, error } = await supabase.rpc('consume_routing_quota', { daily_limit: Number(routingDailyLimit) })
  if (error) {
    console.error('[POST /api/routing/segment] quota', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible de calculer l'itinéraire" })
  }
  if (remaining < 0) {
    throw createError({
      statusCode: 429,
      statusMessage: `Limite de ${routingDailyLimit} calculs d'itinéraire par jour atteinte`,
      data: { reason: ROUTING_QUOTA_REASON },
    })
  }

  let points = null
  let snapped = mode === 'snap'
  if (snapped) {
    try {
      points = await routeAlongPaths(from, to, sport_type)
    }
    catch (error) {
      if (!(error instanceof NoRouteFoundError)) throw error
      snapped = false
    }
  }
  points ??= await elevationAlong(sampleStraightLine(from, to))

  return {
    coordinates: points.map(([lng, lat]) => [round6(lng), round6(lat)]),
    elevations: points.map(([, , ele]) => round1(ele)),
    snapped,
    quota_remaining: remaining,
  }
})
