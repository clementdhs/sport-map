import type { LineString } from 'geojson'
import { serverSupabaseClient } from '#supabase/server'
import type { CollectionDetail } from '#shared/types/routes'

// The caller's "À faire" list, shown like a collection: the routes they keep for later (activity "saved"),
// latest first. Fixed and private: it can't be renamed, shared or deleted.
export default defineEventHandler(async (event): Promise<CollectionDetail> => {
  const userId = await requireUserId(event)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('route_activity')
    .select(`route:routes(${ROUTE_LIST_COLUMNS}, preview:route_preview)`)
    .eq('user_id', userId)
    .eq('activity_type', 'saved')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/collections/todo]', error)
    throw apiError(event, 500, 'api.loadCollectionFailed')
  }

  return {
    id: 'todo',
    name: '',
    description: null,
    is_public: false,
    created_at: '',
    // Shown as the viewer's own list: no owner line.
    owner: null,
    is_mine: true,
    todo: true,
    // A route its owner has since made private comes back without its route: skip it.
    routes: data
      .filter(item => item.route)
      .map(({ route }) => {
        const { preview, ...item } = route!
        return { ...toRouteListItem(item), preview: preview as unknown as LineString }
      }),
  }
})
