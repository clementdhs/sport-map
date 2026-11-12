import { serverSupabaseClient } from '#supabase/server'
import type { Json } from '#shared/types/database.types'

// Saves an outing recorded while following a route: listed on the route's page with the others, and the
// route is marked as completed with its times and leaves the "À faire" list. Its GPS points and their times
// are kept for its splits.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

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

  let track: ReturnType<typeof maskedOutingColumns>
  try {
    track = maskedOutingColumns(body.track, await loadMaskCircles(supabase, user.sub))
  }
  catch (zonesError) {
    console.error('[POST /api/routes/:id/outings] zones', zonesError)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  const startedAt = new Date(body.started_at).toISOString()
  const times = { started_at: startedAt, duration_s: body.duration_s, moving_s: body.moving_s }
  let { data: outing, error } = await supabase
    .from('route_outings')
    .insert({ user_id: user.sub, route_id: routeId, distance_m: body.distance_m, track: track.track as unknown as Json, ...times })
    .select('id')
    .single()
  // Its full points, for the member only (#254); a retry already saved them.
  if (!error && outing && track.original) {
    const original = await supabase.from('outing_originals').insert({ outing_id: outing.id, track: track.original as unknown as Json })
    if (original.error) {
      console.error('[POST /api/routes/:id/outings] original', original.error)
      await supabase.from('route_outings').delete().eq('id', outing.id)
      throw apiError(event, 500, 'api.saveRecordingFailed')
    }
  }
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
  await removeFromTodo(supabase, user.sub, routeId, 'POST /api/routes/:id/outings')

  setResponseStatus(event, 201)
  return { id: outing.id }
})
