import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { RouteSummary } from '#shared/types/routes'

type SearchRow = Database['public']['Functions']['search_routes']['Returns'][number]

export default defineEventHandler(async (event): Promise<RouteSummary[]> => {
  const query = await getValidatedQuery(event, params => routeSearchSchema.parse(params))
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
  })

  if (error) {
    console.error('[GET /api/routes]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de rechercher les parcours' })
  }
  return (data as SearchRow[]).map(({ marker_lng, marker_lat, ...route }) => ({
    ...route,
    is_public: true, // the search only returns public routes
    marker: [marker_lng, marker_lat],
  }))
})
