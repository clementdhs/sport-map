export default defineEventHandler(async (event) => {
  const { supabase, userId, routeId, type } = await activityContext(event)

  const { error } = await supabase
    .from('route_activity')
    .delete()
    .eq('user_id', userId)
    .eq('route_id', routeId)
    .eq('activity_type', type)

  if (error) {
    console.error('[DELETE /api/routes/:id/activity/:type]', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible d'annuler l'action" })
  }
  setResponseStatus(event, 204)
  return null
})
