import { serverSupabaseClient } from '#supabase/server'

// Stops sharing: the share and its track are deleted. Stopping a share already gone is a success.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const shareId = getLiveShareIdParam(event)
  const supabase = await serverSupabaseClient(event)

  const { error } = await supabase.from('live_shares').delete().match({ id: shareId, user_id: user.sub })
  if (error) {
    console.error('[DELETE /api/live/:id]', error)
    throw apiError(event, 500, 'api.stopLiveShareFailed')
  }

  setResponseStatus(event, 204)
  return null
})
