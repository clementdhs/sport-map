import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

// Keeps what Overpass (and for a name, MapTiler / Nominatim) answered around the start's cell (#311), for the family.
// Shared map data no member owns: only the server writes it, after checking the places' shape.
export default defineEventHandler(async (event): Promise<void> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  // The service role below bypasses RLS, which asks members with two-factor authentication for their code.
  await requireMfa(event)

  const { search, start, places } = await readLocalizedBody(event, loopPlacesSaveSchema)
  const key = loopPlacesCacheKey(search, start)
  if (!key) throw apiError(event, 400, 'api.loopPlacesUnavailable')

  const { error } = await serverSupabaseServiceRole<Database>(event)
    .from('loop_place_searches')
    .upsert({ key, places, fetched_at: new Date().toISOString() })
  if (error) {
    console.error('[loop places] not cached', error)
    throw apiError(event, 500, 'api.loopPlacesUnavailable')
  }
  setResponseStatus(event, 204)
})
