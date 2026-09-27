import type { RouteReviews } from '#shared/types/routes'

// Creates or updates the caller's review of the route.
export default defineEventHandler(async (event): Promise<RouteReviews> => {
  const { supabase, routeId, userId } = await reviewContext(event, { requireUser: true })
  const body = await readValidatedBody(event, data => reviewSchema.parse(data))

  // Clear messages for the cases RLS would reject anyway.
  const { data: route } = await supabase.from('routes').select('owner_id, is_public').eq('id', routeId).maybeSingle()
  if (!route) throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })
  if (route.owner_id === userId) {
    throw createError({ statusCode: 403, statusMessage: 'Tu ne peux pas noter ton propre parcours' })
  }
  if (!route.is_public) throw createError({ statusCode: 403, statusMessage: 'Ce parcours est privé' })

  const fields = { rating: body.rating, comment: body.comment || null }
  // Not an upsert: authors may only update these two columns, not the ones an upsert would rewrite.
  const updated = await supabase
    .from('route_reviews')
    .update(fields)
    .eq('route_id', routeId)
    .eq('user_id', userId!)
    .select('id')
  const { error } = updated.data?.length
    ? updated
    : await supabase.from('route_reviews').insert({ ...fields, route_id: routeId, user_id: userId! })

  if (error) {
    console.error('[PUT /api/routes/:id/reviews]', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible d'enregistrer ton avis" })
  }
  return loadRouteReviews(supabase, routeId, userId)
})
