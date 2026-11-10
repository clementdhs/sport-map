import type { H3Event } from 'h3'
import type { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '#shared/types/database.types'
import type { RecordingPayload } from '#shared/utils/routes'

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

// Saves an outing with its own track: the track as a new route of the member, marked as completed with the
// outing's times, and the outing itself, the first one listed on the route, with its GPS points and their times.
// Used by /record (POST /api/recordings) and by the import of outings (POST /api/outings/import). Returns the
// route's id; throws the API error to answer.
export async function saveRecording(event: H3Event, supabase: Supabase, userId: string, body: RecordingPayload, tag: string): Promise<string> {
  const routeBody = { ...body.route, source: 'recorded' as const }
  const { data: route, error, circles } = await insertMaskedRoute(supabase, userId, routeDetailsFromPayload(routeBody), trackFromPayload(routeBody))
  if (error || !route) {
    console.error(`[${tag}] route`, error)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  const startedAt = new Date(body.started_at).toISOString()
  const times = { started_at: startedAt, duration_s: body.duration_s, moving_s: body.moving_s }
  const track = maskedOutingColumns(body.track, circles)
  const [activity, outing] = await Promise.all([
    supabase.from('route_activity').insert({
      user_id: userId,
      route_id: route.id,
      activity_type: 'completed',
      completed_at: outingEnd(startedAt, body.duration_s),
      ...times,
    }),
    supabase.from('route_outings').insert({
      user_id: userId,
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
    console.error(`[${tag}] activity`, activity.error ?? outing.error ?? original?.error)
    await supabase.from('routes').delete().eq('id', route.id)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }
  return route.id
}
