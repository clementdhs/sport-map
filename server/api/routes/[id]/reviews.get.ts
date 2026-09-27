import type { RouteReviews } from '#shared/types/routes'

export default defineEventHandler(async (event): Promise<RouteReviews> => {
  const { supabase, routeId, userId } = await reviewContext(event)
  return loadRouteReviews(supabase, routeId, userId)
})
