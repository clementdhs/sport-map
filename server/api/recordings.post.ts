import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Json } from '#shared/types/database.types'

// Saves an outing recorded with the phone's GPS: its track as a new route of the caller, marked as
// completed with the outing's times, and the outing itself, the first one listed on the route, with its GPS
// points and their times.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const body = await readLocalizedBody(event, recordingSchema)
  const supabase = await serverSupabaseClient(event)

  const routeBody = { ...body.route, source: 'recorded' as const }
  const { data: route, error, circles } = await insertMaskedRoute(supabase, user.sub, routeDetailsFromPayload(routeBody), trackFromPayload(routeBody))
  if (error || !route) {
    console.error('[POST /api/recordings] route', error)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  const startedAt = new Date(body.started_at).toISOString()
  const times = { started_at: startedAt, duration_s: body.duration_s, moving_s: body.moving_s }
  const track = maskedOutingColumns(body.track, circles)
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
      // The full distance, whatever the team sees of the track.
      distance_m: body.distance_m ?? route.full_distance_m,
      track: track.track as unknown as Json,
      ...times,
    }).select('id').single(),
  ])
  const original = outing.data && track.original
    ? await supabase.from('outing_originals').insert({ outing_id: outing.data.id, track: track.original as unknown as Json })
    : null
  if (activity.error || outing.error || original?.error) {
    // No half-saved outing: the route goes too, and its activity and outing with it.
    console.error('[POST /api/recordings] activity', activity.error ?? outing.error ?? original?.error)
    await supabase.from('routes').delete().eq('id', route.id)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  setResponseStatus(event, 201)
  return { id: route.id }
})
