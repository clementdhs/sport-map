import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// Adds the points of the sharer's track not yet received. Points sent again (lost answer) are ignored, and
// the latest position is always the latest fix: a point arriving late never replaces a newer one.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const shareId = getLiveShareIdParam(event)
  const body = await readLocalizedBody(event, livePointsSchema)
  const supabase = await serverSupabaseClient(event)

  const { error } = await supabase.from('live_positions').upsert(
    body.points.map(point => ({
      share_id: shareId,
      fixed_at: new Date(point.fixed_at).toISOString(),
      lng: point.lng,
      lat: point.lat,
      accuracy_m: point.accuracy_m ?? null,
    })),
    { onConflict: 'share_id,fixed_at', ignoreDuplicates: true },
  )
  // RLS refuses points for a share that isn't the member's, has expired or was stopped: the phone stops sharing.
  if (error?.code === '42501') throw apiError(event, 404, 'api.liveShareNotFound')
  if (error) {
    console.error('[POST /api/live/:id/points]', error)
    throw apiError(event, 500, 'api.sendLivePointsFailed')
  }

  setResponseStatus(event, 204)
  return null
})
