import type { RouteReviews } from '#shared/types/routes'

// Reports a review as abusive. A review reported by 3 users is hidden automatically (database trigger).
export default defineEventHandler(async (event): Promise<RouteReviews> => {
  const { supabase, routeId, userId } = await reviewContext(event, { requireUser: true })
  const reviewId = getReviewIdParam(event)

  const { error } = await supabase.from('review_reports').insert({ review_id: reviewId, reporter_id: userId! })
  // 23505: already reported by this user, nothing more to do.
  if (error && error.code !== '23505') {
    // RLS: the review is the caller's own, or not visible to them.
    if (error.code === '42501') throw createError({ statusCode: 403, statusMessage: 'Tu ne peux pas signaler cet avis' })
    console.error('[POST /api/routes/:id/reviews/:reviewId/report]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de signaler cet avis' })
  }
  return loadRouteReviews(supabase, routeId, userId)
})
