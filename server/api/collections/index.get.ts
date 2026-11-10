import * as z from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { CollectionSummary } from '#shared/types/routes'

// A link of the mosaic: the route's simplified track (track_thumbnail in SQL); the generated types don't know
// computed fields embedded through a relation.
type Cover = { route: { thumbnail: unknown } | null }

// The caller's collections, most recently updated first. With ?route=<id>, each one says whether it holds
// that route (for the "add to a collection" menu of a route page).
export default defineEventHandler(async (event): Promise<CollectionSummary[]> => {
  const userId = await requireUserId(event)
  const { route } = await getLocalizedQuery(event, z.object({ route: z.uuid().optional() }))
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('collections')
    .select('id, name, description, is_public, links:collection_routes(route_id), covers:collection_routes(added_at, route:routes(thumbnail:route_thumbnail))')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    // The profile's mosaic draws the outlines of the last routes added.
    .order('added_at', { referencedTable: 'covers', ascending: false })
    .limit(COLLECTION_COVERS, { referencedTable: 'covers' })

  if (error) {
    console.error('[GET /api/collections]', error)
    throw apiError(event, 500, 'api.loadCollectionsFailed')
  }
  // RLS only returns the links to routes the caller can see.
  return data.map(({ links, covers, ...collection }) => ({
    ...collection,
    route_count: links.length,
    thumbnails: (covers as Cover[]).map(cover => thumbnailPath(cover.route?.thumbnail)).filter(path => path !== null),
    contains: !!route && links.some((link: { route_id: string }) => link.route_id === route),
  }))
})
