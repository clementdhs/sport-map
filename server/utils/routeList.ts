import type { RouteListItem } from '#shared/types/routes'

export const ROUTE_LIST_COLUMNS
  = 'id, name, sport_type, distance_m, elevation_gain_m, is_public, is_loop, rating_avg, rating_count, created_at, thumbnail:route_thumbnail, owner:profiles(username, display_name, avatar_path)' as const

interface RouteListRow extends Omit<RouteListItem, 'owner_name' | 'owner_avatar_path' | 'thumbnail'> {
  owner: { username: string, display_name: string | null, avatar_path: string | null } | null
  // Simplified track coordinates (track_thumbnail in SQL)
  thumbnail: unknown
}

export function toRouteListItem({ owner, thumbnail, ...route }: RouteListRow): RouteListItem {
  return {
    ...route,
    owner_name: owner?.display_name ?? owner?.username ?? '',
    owner_avatar_path: owner?.avatar_path ?? null,
    thumbnail: thumbnailPath(thumbnail),
  }
}
