export default defineEventHandler(async (event) => {
  const { supabase, userId, routeId, type } = await activityContext(event)

  // RLS only accepts activity on routes the user can see.
  const { error } = await supabase
    .from('route_activity')
    .upsert(
      {
        user_id: userId,
        route_id: routeId,
        activity_type: type,
        completed_at: type === 'completed' ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id,route_id,activity_type' },
    )

  if (error) {
    console.error('[PUT /api/routes/:id/activity/:type]', error)
    throw apiError(event, 500, 'api.saveActionFailed')
  }
  if (type === 'completed') await removeFromTodo(supabase, userId, routeId, 'PUT /api/routes/:id/activity/:type')
  setResponseStatus(event, 204)
  return null
})
