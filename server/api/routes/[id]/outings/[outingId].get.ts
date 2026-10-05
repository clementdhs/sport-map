import * as z from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { OutingDetail } from '#shared/types/routes'
import type { OutingTrackPoint } from '#shared/utils/routes'

// The GPS points of an outing, for its splits and speed chart: loaded when its detail is opened, since a track
// weighs much more than the list of outings.
export default defineEventHandler(async (event): Promise<OutingDetail> => {
  const routeId = getRouteIdParam(event)
  const outingId = getRouterParam(event, 'outingId')
  if (!z.uuid().safeParse(outingId).success) throw apiError(event, 404, 'api.outingNotFound')

  const supabase = await serverSupabaseClient(event)
  // RLS: outings share their route's visibility.
  const { data, error } = await supabase
    .from('route_outings')
    .select('track')
    .eq('id', outingId!)
    .eq('route_id', routeId)
    .maybeSingle()
  if (error) {
    console.error('[GET /api/routes/:id/outings/:outingId]', error)
    throw apiError(event, 500, 'api.loadOutingFailed')
  }
  // Outings recorded before their points were kept have no detail.
  if (!data?.track) throw apiError(event, 404, 'api.outingNotFound')

  return { track: data.track as OutingTrackPoint[] }
})
