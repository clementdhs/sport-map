import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { LiveShareListItem } from '#shared/types/live'
import type { LngLat, SportType } from '#shared/utils/routes'
import type { Database } from '#shared/types/database.types'

// PostgREST's default max rows: the tracks of every share in progress come in pages.
const PAGE_SIZE = 1000

// The family's shares in progress, latest started first. With ?map=true (/live, #237), each with its sport, the
// distance covered and its mini-map; without (the home banner), only the summary, so its polling stays light.
export default defineEventHandler(async (event): Promise<LiveShareListItem[]> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const { map } = getLocalizedQuery(event, liveListQuerySchema)
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
  if (!map || !data.length) return data.map(row => ({ ...toLiveShareSummary(row, user.sub), sport: null, distance_m: 0, thumbnail: null }))

  const [tracks, routes] = await Promise.all([liveTracks(event, data.map(share => share.id)), followedRoutes(event, data.map(share => share.route_id))])
  return data.map((row) => {
    const track = tracks.get(row.id) ?? []
    const route = row.route_id ? routes.get(row.route_id) : undefined
    const outline = Array.isArray(route?.thumbnail) ? route.thumbnail as LngLat[] : null
    return {
      ...toLiveShareSummary(row, user.sub),
      sport: route?.sport_type ?? null,
      distance_m: Math.round(trackDistances(track).at(-1) ?? 0),
      thumbnail: liveThumbnail(outline, track),
    }
  })
})

// The tracks covered, in order.
async function liveTracks(event: H3Event, shareIds: string[]): Promise<Map<string, LngLat[]>> {
  const supabase = await serverSupabaseClient(event)
  const tracks = new Map<string, LngLat[]>()
  for (let page = 0; ; page++) {
    const { data: points, error: pointsError } = await supabase
      .from('live_positions')
      .select('share_id, lng, lat')
      .in('share_id', shareIds)
      .order('share_id')
      .order('fixed_at')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (pointsError) {
      console.error('[GET /api/live] points', pointsError)
      throw apiError(event, 500, 'api.loadLiveSharesFailed')
    }
    for (const point of points) {
      const track = tracks.get(point.share_id) ?? []
      track.push([point.lng, point.lat])
      tracks.set(point.share_id, track)
    }
    if (points.length < PAGE_SIZE) break
  }
  return tracks
}

// The routes followed, simplified, even private ones of the sharer's (service role), as on the full map:
// sharing them with the family was their choice.
async function followedRoutes(event: H3Event, ids: (string | null)[]): Promise<Map<string, { sport_type: SportType, thumbnail: unknown }>> {
  const routeIds = [...new Set(ids.filter(id => id !== null))]
  const routes = new Map<string, { sport_type: SportType, thumbnail: unknown }>()
  if (!routeIds.length) return routes
  const { data, error } = await serverSupabaseServiceRole<Database>(event)
    .from('routes')
    .select('id, sport_type, thumbnail:route_thumbnail')
    .in('id', routeIds)
    // Entirely inside the sharer's privacy zones (#254): the row keeps the full track.
    .eq('privacy_hidden', false)
  if (error) console.error('[GET /api/live] routes', error)
  for (const row of data ?? []) routes.set(row.id, row)
  return routes
}
