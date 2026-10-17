import type { RouteListItem } from '#shared/types/routes'

export const ROUTE_LIST_COLUMNS
  = 'id, name, sport_type, distance_m, elevation_gain_m, is_public, is_loop, rating_avg, rating_count, created_at, thumbnail:route_thumbnail, owner:profiles(username, display_name)' as const

interface RouteListRow extends Omit<RouteListItem, 'owner_name' | 'thumbnail'> {
  owner: { username: string, display_name: string | null } | null
  // Simplified track coordinates (track_thumbnail in SQL)
  thumbnail: unknown
}

export function toRouteListItem({ owner, thumbnail, ...route }: RouteListRow): RouteListItem {
  return { ...route, owner_name: owner?.display_name ?? owner?.username ?? '', thumbnail: thumbnailPath(thumbnail) }
}
