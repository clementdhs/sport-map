import type { RouteReviews } from '#shared/types/routes'

// Deletes the caller's review of the route.
export default defineEventHandler(async (event): Promise<RouteReviews> => {
  const { supabase, routeId, userId } = await reviewContext(event, { requireUser: true })
  const { error } = await supabase.from('route_reviews').delete().eq('route_id', routeId).eq('user_id', userId!)
  if (error) {
    console.error('[DELETE /api/routes/:id/reviews]', error)
    throw apiError(event, 500, 'api.deleteReviewFailed')
  }
  return loadRouteReviews(event, supabase, routeId, userId)
})
