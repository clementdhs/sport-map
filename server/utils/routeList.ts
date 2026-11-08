import type { RouteListItem, RouteQuote } from '#shared/types/routes'

export const ROUTE_LIST_COLUMNS
  = 'id, name, sport_type, distance_m, elevation_gain_m, is_public, is_loop, rating_avg, rating_count, created_at, thumbnail:route_thumbnail, quote:route_quote, done_count:route_done_count, owner:profiles(username, display_name, avatar_path)' as const

interface RouteListRow extends Omit<RouteListItem, 'owner_name' | 'owner_avatar_path' | 'thumbnail' | 'quote' | 'done_count'> {
  owner: { username: string, display_name: string | null, avatar_path: string | null } | null
  // Simplified track coordinates (track_thumbnail in SQL)
  thumbnail: unknown
  // route_quote and route_done_count in SQL
  quote: unknown
  done_count: number | null
}

export function toRouteListItem({ owner, thumbnail, quote, done_count, ...route }: RouteListRow): RouteListItem {
  return {
    ...route,
    quote: toRouteQuote(quote),
    done_count: done_count ?? 0,
    owner_name: owner?.display_name ?? owner?.username ?? '',
    owner_avatar_path: owner?.avatar_path ?? null,
    thumbnail: thumbnailPath(thumbnail),
  }
}

// route_quote's JSON, null when missing or malformed
export function toRouteQuote(value: unknown): RouteQuote | null {
  if (!value || typeof value !== 'object') return null
  const { comment, author } = value as Record<string, unknown>
  return typeof comment === 'string' && comment.trim() && typeof author === 'string'
    ? { comment: comment.trim(), author }
    : null
}
