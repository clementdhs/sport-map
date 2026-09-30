import * as z from 'zod'
import type { RouteReviews } from '#shared/types/routes'

// Lets the route's owner hide a review's comment, or show it again. The rating keeps counting.
export default defineEventHandler(async (event): Promise<RouteReviews> => {
  const { supabase, routeId, userId } = await reviewContext(event, { requireUser: true })
  const reviewId = getReviewIdParam(event)
  const { hidden } = await readLocalizedBody(event, z.object({ hidden: z.boolean() }))

  const { data: changed, error } = await supabase.rpc('set_review_hidden', { review_id: reviewId, hidden })
  if (error) {
    console.error('[PUT /api/routes/:id/reviews/:reviewId/hidden]', error)
    throw apiError(event, 500, 'api.updateReviewFailed')
  }
  // false: not a review of one of the caller's routes.
  if (!changed) throw apiError(event, 404, 'api.reviewNotFound')
  return loadRouteReviews(event, supabase, routeId, userId)
})
