import type { H3Event } from 'h3'
import type { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '#shared/types/database.types'
import type { OutingPayload } from '#shared/utils/routes'

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

// Saves an outing done on an existing route, recorded while following it (POST /api/routes/:id/outings) or
// imported from a watch's file (POST /api/routes/:id/outings/import, #138): listed on the route's page with the
// others, and the route is marked as completed with its times and leaves the "À faire" list. Its GPS points and
// their times are kept for its splits. The route must exist and be visible to the member. Returns the outing's id;
// throws the API error to answer.
export async function saveRouteOuting(event: H3Event, supabase: Supabase, userId: string, routeId: string, body: OutingPayload, tag: string): Promise<string> {
  let track: ReturnType<typeof maskedOutingColumns>
  try {
    track = maskedOutingColumns(body.track, await loadMaskCircles(supabase, userId))
  }
  catch (zonesError) {
    console.error(`[${tag}] zones`, zonesError)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  const startedAt = new Date(body.started_at).toISOString()
  const times = { started_at: startedAt, duration_s: body.duration_s, moving_s: body.moving_s }
  let { data: outing, error } = await supabase
    .from('route_outings')
    .insert({ user_id: userId, route_id: routeId, distance_m: body.distance_m, track: track.track as unknown as Json, ...times })
    .select('id')
    .single()
  // Its full points, for the member only (#254); a retry already saved them.
  if (!error && outing && track.original) {
    const original = await supabase.from('outing_originals').insert({ outing_id: outing.id, track: track.original as unknown as Json })
    if (original.error) {
      console.error(`[${tag}] original`, original.error)
      await supabase.from('route_outings').delete().eq('id', outing.id)
      throw apiError(event, 500, 'api.saveRecordingFailed')
    }
  }
  // Already saved by an earlier attempt whose answer was lost: that's a success.
  if (error?.code === '23505') {
    ({ data: outing, error } = await supabase
      .from('route_outings')
      .select('id')
      .match({ user_id: userId, route_id: routeId, started_at: startedAt })
      .single())
  }
  if (error || !outing) {
    console.error(`[${tag}]`, error)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }

  // "Done", with the times of this latest outing.
  const activity = await supabase.from('route_activity').upsert(
    {
      user_id: userId,
      route_id: routeId,
      activity_type: 'completed',
      completed_at: outingEnd(startedAt, body.duration_s),
      ...times,
    },
    { onConflict: 'user_id,route_id,activity_type' },
  )
  if (activity.error) {
    // No half-saved outing.
    console.error(`[${tag}] activity`, activity.error)
    await supabase.from('route_outings').delete().eq('id', outing.id)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }
  await removeFromTodo(supabase, userId, routeId, tag)
  return outing.id
}

// The route of an outing of the member starting within IMPORT_SAME_START_S of `startedAt`, on any route (#268):
// the same file imported again, or the same outing recorded by the app and by a watch. Null when there is none.
export async function sameStartOutingRoute(event: H3Event, supabase: Supabase, userId: string, startedAt: string, tag: string): Promise<string | null> {
  const start = Date.parse(startedAt)
  const { data, error } = await supabase
    .from('route_outings')
    .select('route_id')
    .eq('user_id', userId)
    .gte('started_at', new Date(start - IMPORT_SAME_START_S * 1000).toISOString())
    .lte('started_at', new Date(start + IMPORT_SAME_START_S * 1000).toISOString())
    .limit(1)
  if (error) {
    console.error(`[${tag}] existing`, error)
    throw apiError(event, 500, 'api.saveRecordingFailed')
  }
  return data[0]?.route_id ?? null
}
