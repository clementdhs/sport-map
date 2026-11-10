import type { H3Event } from 'h3'
import { serverSupabaseClient } from '#supabase/server'

// Counts one OpenRouteService call for the signed-in user and returns how many are left today; past the limit,
// answers 429 with ROUTING_QUOTA_REASON. Called before OpenRouteService, failed calls included: a loop of bad
// requests costs too.
export async function consumeRoutingQuota(event: H3Event): Promise<number> {
  // consume_routing_quota is security definer: a stolen password without the code must not spend the quota (#253).
  await requireMfa(event)
  const { routingDailyLimit } = useRuntimeConfig(event)
  const supabase = await serverSupabaseClient(event)
  const { data: remaining, error } = await supabase.rpc('consume_routing_quota', { daily_limit: Number(routingDailyLimit) })
  if (error) {
    console.error('[routing quota]', error)
    throw apiError(event, 500, 'api.routingFailed')
  }
  if (remaining < 0) {
    throw apiError(event, 429, 'api.routingQuota', { limit: routingDailyLimit }, { reason: ROUTING_QUOTA_REASON })
  }
  return remaining
}
