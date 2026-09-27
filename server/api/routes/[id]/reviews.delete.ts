import type { RouteReviews } from '#shared/types/routes'

// Deletes the caller's review of the route.
export default defineEventHandler(async (event): Promise<RouteReviews> => {
  const { supabase, routeId, userId } = await reviewContext(event, { requireUser: true })
  const { error } = await supabase.from('route_reviews').delete().eq('route_id', routeId).eq('user_id', userId!)
  if (error) {
    console.error('[DELETE /api/routes/:id/reviews]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de supprimer ton avis' })
  }
  return loadRouteReviews(supabase, routeId, userId)
})
