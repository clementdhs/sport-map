import * as z from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { CollectionSummary } from '#shared/types/routes'

// The caller's collections, most recently updated first. With ?route=<id>, each one says whether it holds
// that route (for the "add to a collection" menu of a route page).
export default defineEventHandler(async (event): Promise<CollectionSummary[]> => {
  const userId = await requireUserId(event)
  const { route } = await getLocalizedQuery(event, z.object({ route: z.uuid().optional() }))
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('collections')
    .select('id, name, description, is_public, links:collection_routes(route_id)')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[GET /api/collections]', error)
    throw apiError(event, 500, 'api.loadCollectionsFailed')
  }
  // RLS only returns the links to routes the caller can see.
  return data.map(({ links, ...collection }) => ({
    ...collection,
    route_count: links.length,
    contains: !!route && links.some((link: { route_id: string }) => link.route_id === route),
  }))
})
