import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { LiveShareSummary } from '#shared/types/live'

// The family's shares in progress, latest started first.
export default defineEventHandler(async (event): Promise<LiveShareSummary[]> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('live_shares')
    .select(LIVE_SHARE_COLUMNS)
    // RLS still lets members see their own expired share.
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .order('fixed_at', { referencedTable: 'live_positions', ascending: false })
    .limit(1, { referencedTable: 'live_positions' })

  if (error) {
    console.error('[GET /api/live]', error)
    throw apiError(event, 500, 'api.loadLiveSharesFailed')
  }
  return data.map(row => toLiveShareSummary(row, user.sub))
})
