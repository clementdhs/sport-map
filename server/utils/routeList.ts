import type { RouteListItem } from '#shared/types/routes'

export const ROUTE_LIST_COLUMNS
  = 'id, name, sport_type, distance_m, elevation_gain_m, is_public, is_loop, created_at, owner:profiles(username)' as const

interface RouteListRow extends Omit<RouteListItem, 'owner_username'> {
  owner: { username: string } | null
}

export function toRouteListItem({ owner, ...route }: RouteListRow): RouteListItem {
  return { ...route, owner_username: owner?.username ?? '' }
}
