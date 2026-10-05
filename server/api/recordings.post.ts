import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// Saves an outing recorded with the phone's GPS: its track as a new route of the caller, marked as
// completed with the outing's times, and the outing itself, the first one listed on the route, with its GPS
// points and their times.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const body = await readLocalizedBody(event, recordingSchema)
  const supabase = await serverSupabaseClient(event)

  const { data: route, error } = await supabase
    .from('routes')
    .insert({ owner_id: user.sub, ...routeRowFromPayload({ ...body.route, source: 'recorded' }) })
    .select('id, distance_m')
    .single()
  if (error) {
    console.error('[POST /api/recordings] route', error)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  const startedAt = new Date(body.started_at).toISOString()
  const times = { started_at: startedAt, duration_s: body.duration_s, moving_s: body.moving_s }
  const [activity, outing] = await Promise.all([
    supabase.from('route_activity').insert({
      user_id: user.sub,
      route_id: route.id,
      activity_type: 'completed',
      completed_at: outingEnd(startedAt, body.duration_s),
      ...times,
    }),
    supabase.from('route_outings').insert({
      user_id: user.sub,
      route_id: route.id,
      distance_m: body.distance_m ?? route.distance_m,
      track: body.track ?? null,
      ...times,
    }),
  ])
  if (activity.error || outing.error) {
    // No half-saved outing: the route goes too, and its activity and outing with it.
    console.error('[POST /api/recordings] activity', activity.error ?? outing.error)
    await supabase.from('routes').delete().eq('id', route.id)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  setResponseStatus(event, 201)
  return { id: route.id }
})
