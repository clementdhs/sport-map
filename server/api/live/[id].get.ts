import type { LineString } from 'geojson'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { LivePoint, LiveShareDetail } from '#shared/types/live'
import type { Database } from '#shared/types/database.types'

// PostgREST's default max rows: a 12-hour track has up to 1440 points.
const PAGE_SIZE = 1000

// A share in progress and its track, for the family's map. With ?after=, only the newer points (polling).
export default defineEventHandler(async (event): Promise<LiveShareDetail> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const shareId = getLiveShareIdParam(event)
  const { after } = getLocalizedQuery(event, liveShareQuerySchema)
  const supabase = await serverSupabaseClient(event)

  const { data: share, error } = await supabase
    .from('live_shares')
    .select(LIVE_SHARE_COLUMNS)
    .eq('id', shareId)
    // RLS still lets members see their own expired share.
    .gt('expires_at', new Date().toISOString())
    .order('fixed_at', { referencedTable: 'live_positions', ascending: false })
    .limit(1, { referencedTable: 'live_positions' })
    .maybeSingle()
  if (error) {
    console.error('[GET /api/live/:id]', error)
    throw apiError(event, 500, 'api.loadLiveSharesFailed')
  }
  if (!share) throw apiError(event, 404, 'api.liveShareNotFound')

  const points: LivePoint[] = []
  for (let page = 0; ; page++) {
    let query = supabase
      .from('live_positions')
      .select('fixed_at, lng, lat, accuracy_m')
      .eq('share_id', shareId)
      .order('fixed_at')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (after) query = query.gt('fixed_at', new Date(after).toISOString())
    const { data, error: pointsError } = await query
    if (pointsError) {
      console.error('[GET /api/live/:id] points', pointsError)
      throw apiError(event, 500, 'api.loadLiveSharesFailed')
    }
    points.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  // The track of the route followed, even a private one of the sharer's (service role): sharing it with the
  // family was their choice. Its name and page stay theirs (`route` is null then).
  let routeGeometry: LineString | null = null
  if (share.route_id && !after) {
    const client = share.route ? supabase : serverSupabaseServiceRole<Database>(event)
    // A route entirely inside the sharer's privacy zones keeps its full track in the row (#254): never sent.
    const { data } = await client.from('routes').select('geometry:route_geojson').eq('id', share.route_id).eq('privacy_hidden', false).maybeSingle()
    routeGeometry = (data?.geometry as unknown as LineString | undefined) ?? null
  }

  return { ...toLiveShareSummary(share, user.sub), points, route_geometry: routeGeometry }
})
