import type { serverSupabaseClient } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { RouteListItem, RouteQuote } from '#shared/types/routes'

export const ROUTE_LIST_COLUMNS
  = 'id, name, sport_type, distance_m, elevation_gain_m, is_public, is_loop, rating_avg, rating_count, created_at, thumbnail:route_thumbnail, quote:route_quote, done_count:route_done_count, owner:profiles(username, display_name, avatar_path), original:route_originals(distance_m, elevation_gain_m, thumbnail:route_original_thumbnail)' as const

// The full figures and outline of a route cut by privacy zones (#254), for its owner only (RLS).
export interface RouteOriginalFigures {
  distance_m: number
  elevation_gain_m: number | null
  thumbnail: unknown
}

interface RouteListRow extends Omit<RouteListItem, 'owner_name' | 'owner_avatar_path' | 'thumbnail' | 'quote' | 'done_count'> {
  original: RouteOriginalFigures | null
  owner: { username: string, display_name: string | null, avatar_path: string | null } | null
  // Simplified track coordinates (track_thumbnail in SQL)
  thumbnail: unknown
  // route_quote and route_done_count in SQL
  quote: unknown
  done_count: number | null
}

export function toRouteListItem({ owner, thumbnail, quote, done_count, original, ...route }: RouteListRow): RouteListItem {
  return {
    ...route,
    quote: toRouteQuote(quote),
    done_count: done_count ?? 0,
    owner_name: owner?.display_name ?? owner?.username ?? '',
    owner_avatar_path: owner?.avatar_path ?? null,
    thumbnail: thumbnailPath(thumbnail),
    ...(original && {
      distance_m: original.distance_m,
      elevation_gain_m: original.elevation_gain_m,
      thumbnail: thumbnailPath(original.thumbnail),
    }),
  }
}

// Full figures of the caller's own masked routes among `ids`, by route id: search_routes, a function, can't embed
// route_originals.
export async function routeOriginalFigures(
  supabase: Awaited<ReturnType<typeof serverSupabaseClient<Database>>>,
  ids: string[],
): Promise<Map<string, RouteOriginalFigures>> {
  if (!ids.length) return new Map()
  const { data, error } = await supabase
    .from('route_originals')
    .select('route_id, distance_m, elevation_gain_m, thumbnail:route_original_thumbnail')
    .in('route_id', ids)
  // The cards then show what the team sees.
  if (error) console.error('[routeOriginalFigures]', error)
  return new Map((data ?? []).map(({ route_id: routeId, ...figures }) => [routeId, figures]))
}

// route_quote's JSON, null when missing or malformed
export function toRouteQuote(value: unknown): RouteQuote | null {
  if (!value || typeof value !== 'object') return null
  const { comment, author } = value as Record<string, unknown>
  return typeof comment === 'string' && comment.trim() && typeof author === 'string'
    ? { comment: comment.trim(), author }
    : null
}
