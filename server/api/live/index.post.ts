import { serverSupabaseClient } from '#supabase/server'
import type { LiveShareStarted } from '#shared/types/live'

// Starts sharing the member's position with the family, replacing a share of theirs whose end never reached
// the server (one at a time). It ends with DELETE /api/live/:id, or 12 hours later at the latest.
export default defineEventHandler(async (event): Promise<LiveShareStarted> => {
  const user = await requireUser(event)

  const body = await readLocalizedBody(event, liveShareStartSchema)
  const supabase = await serverSupabaseClient(event)

  const previous = await supabase.from('live_shares').delete().eq('user_id', user.sub)
  if (previous.error) {
    console.error('[POST /api/live] previous', previous.error)
    throw apiError(event, 500, 'api.startLiveShareFailed')
  }

  const { data, error } = await supabase
    .from('live_shares')
    .insert({ user_id: user.sub, route_id: body.route_id ?? null })
    .select('id, expires_at')
    .single()
  // RLS refuses routes the member can't see.
  if (error?.code === '42501') throw apiError(event, 404, 'api.routeNotFound')
  if (error || !data) {
    console.error('[POST /api/live]', error)
    throw apiError(event, 500, 'api.startLiveShareFailed')
  }

  setResponseStatus(event, 201)
  return data
})
