import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// Saves an outing recorded while following a route: listed on the route's page with the others, and the
// route is marked as completed with its times. Its GPS points and their times are kept for its splits.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const routeId = getRouteIdParam(event)
  const body = await readLocalizedBody(event, outingSchema)
  const supabase = await serverSupabaseClient(event)

  // RLS hides private routes of other users: they are reported as missing.
  const { data: route, error: routeError } = await supabase.from('routes').select('id').eq('id', routeId).maybeSingle()
  if (routeError) {
    console.error('[POST /api/routes/:id/outings] route', routeError)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }
  if (!route) throw apiError(event, 404, 'api.routeNotFound')

  const startedAt = new Date(body.started_at).toISOString()
  const times = { started_at: startedAt, duration_s: body.duration_s, moving_s: body.moving_s }
  let { data: outing, error } = await supabase
    .from('route_outings')
    .insert({ user_id: user.sub, route_id: routeId, distance_m: body.distance_m, track: body.track ?? null, ...times })
    .select('id')
    .single()
  // Already saved by an earlier attempt whose answer was lost: that's a success.
  if (error?.code === '23505') {
    ({ data: outing, error } = await supabase
      .from('route_outings')
      .select('id')
      .match({ user_id: user.sub, route_id: routeId, started_at: startedAt })
      .single())
  }
  if (error || !outing) {
    console.error('[POST /api/routes/:id/outings]', error)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  // "Done", with the times of this latest outing.
  const activity = await supabase.from('route_activity').upsert(
    {
      user_id: user.sub,
      route_id: routeId,
      activity_type: 'completed',
      completed_at: outingEnd(startedAt, body.duration_s),
      ...times,
    },
    { onConflict: 'user_id,route_id,activity_type' },
  )
  if (activity.error) {
    // No half-saved outing.
    console.error('[POST /api/routes/:id/outings] activity', activity.error)
    await supabase.from('route_outings').delete().eq('id', outing.id)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  setResponseStatus(event, 201)
  return { id: outing.id }
})
