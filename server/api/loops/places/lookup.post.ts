import { serverSupabaseClient } from '#supabase/server'
import type { CachedLoopPlaces } from '#shared/types/loopPlaces'
import type { Database } from '#shared/types/database.types'

// The places the family's searches already found around the start's cell (#311). A POST to keep the start out of
// the URL. Read as the member (RLS: members only); nothing kept, or no key (« le lac »): null.
export default defineEventHandler(async (event): Promise<CachedLoopPlaces> => {
  const { search, start } = await readLocalizedBody(event, loopPlacesLookupSchema)
  const key = loopPlacesCacheKey(search, start)
  if (!key) return null
  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase
    .from('loop_place_searches')
    .select('places, fetched_at')
    .eq('key', key)
    .maybeSingle()
  if (error) {
    console.error('[loop places]', error)
    throw apiError(event, 500, 'api.loopPlacesUnavailable')
  }
  return data as CachedLoopPlaces
})
