import * as z from 'zod'
import type { RouteReviews } from '#shared/types/routes'

// Lets the route's owner hide a review's comment, or show it again. The rating keeps counting.
export default defineEventHandler(async (event): Promise<RouteReviews> => {
  const { supabase, routeId, userId } = await reviewContext(event, { requireUser: true })
  const reviewId = getReviewIdParam(event)
  const { hidden } = await readValidatedBody(event, data => z.object({ hidden: z.boolean() }).parse(data))

  const { data: changed, error } = await supabase.rpc('set_review_hidden', { review_id: reviewId, hidden })
  if (error) {
    console.error('[PUT /api/routes/:id/reviews/:reviewId/hidden]', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible de modifier l'avis" })
  }
  // false: not a review of one of the caller's routes.
  if (!changed) throw createError({ statusCode: 404, statusMessage: 'Avis introuvable' })
  return loadRouteReviews(supabase, routeId, userId)
})
