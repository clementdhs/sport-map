import type { LineString } from 'geojson'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { CollectionDetail } from '#shared/types/routes'

// A collection with the routes the caller may see in it (RLS: a private route stays hidden, even in a public
// collection), in the order they were added, with simplified tracks for its map.
export default defineEventHandler(async (event): Promise<CollectionDetail> => {
  const id = getCollectionIdParam(event)
  const supabase = await serverSupabaseClient(event)
  const user = await serverSupabaseUser(event)

  const [collection, links] = await Promise.all([
    supabase
      .from('collections')
      .select('id, name, description, is_public, created_at, owner_id, owner:profiles(username, display_name)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('collection_routes')
      .select(`route:routes(${ROUTE_LIST_COLUMNS}, preview:route_preview)`)
      .eq('collection_id', id)
      .order('added_at'),
  ])

  if (collection.error || links.error) {
    console.error('[GET /api/collections/:id]', collection.error ?? links.error)
    throw apiError(event, 500, 'api.loadCollectionFailed')
  }
  if (!collection.data) throw apiError(event, 404, 'api.collectionNotFound')

  const { owner_id, ...rest } = collection.data
  return {
    ...rest,
    is_mine: owner_id === user?.sub,
    routes: links.data
      .filter(link => link.route)
      .map(({ route }) => {
        const { preview, ...item } = route!
        return { ...toRouteListItem(item), preview: preview as unknown as LineString }
      }),
  }
})
