import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { RouteSummary } from '#shared/types/routes'

type SearchRow = Database['public']['Functions']['search_routes']['Returns'][number]

export default defineEventHandler(async (event): Promise<RouteSummary[]> => {
  const query = await getLocalizedQuery(event, routeSearchSchema)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase.rpc('search_routes', {
    min_lng: query.minLng,
    min_lat: query.minLat,
    max_lng: query.maxLng,
    max_lat: query.maxLat,
    sport: query.sport,
    min_distance_m: query.minKm !== undefined ? query.minKm * 1000 : undefined,
    max_distance_m: query.maxKm !== undefined ? query.maxKm * 1000 : undefined,
    min_gain_m: query.minGain,
    max_gain_m: query.maxGain,
    loops_only: query.loops ?? false,
    passing_through: query.through ?? false,
    sort: query.sort,
    max_results: MAX_SEARCH_RESULTS,
    text_query: query.q || undefined,
    mine_only: query.scope === 'mine',
  })

  if (error) {
    console.error('[GET /api/routes]', error)
    throw apiError(event, 500, 'api.searchFailed')
  }
  const rows = data as SearchRow[]
  // The caller's own routes cut by privacy zones show their full figures (#254: RLS only gives theirs); the
  // marker stays the visible start, as the search found it.
  const originals = await routeOriginalFigures(supabase, rows.map(row => row.id))
  return rows.map(({ marker_lng, marker_lat, thumbnail, owner_avatar_path, quote, ...route }) => {
    const original = originals.get(route.id)
    return {
      ...route,
      quote: toRouteQuote(quote),
      // Null for owners without a photo, whatever the generated type says.
      owner_avatar_path: owner_avatar_path ?? null,
      thumbnail: thumbnailPath(original?.thumbnail ?? thumbnail),
      marker: [marker_lng, marker_lat],
      ...(original && { distance_m: original.distance_m, elevation_gain_m: original.elevation_gain_m }),
    }
  })
})
