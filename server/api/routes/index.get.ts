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
    max_results: MAX_SEARCH_RESULTS,
  })

  if (error) {
    console.error('[GET /api/routes]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de rechercher les parcours' })
  }
  return (data as SearchRow[]).map(({ start_lng, start_lat, ...route }) => ({
    ...route,
    is_public: true, // the search only returns public routes
    start: [start_lng, start_lat],
  }))
})
