import type { H3Event } from 'h3'
import * as z from 'zod'
import type { LiveShareSummary } from '#shared/types/live'

// A share in progress with its sharer, its route and its latest point (embedded live_positions, sorted and
// limited by the query: see liveShareSummaries).
export const LIVE_SHARE_COLUMNS
  = 'id, user_id, started_at, expires_at, route_id, user:profiles(username, display_name, avatar_path), route:routes(id, name), live_positions(fixed_at)' as const

interface LiveShareRow {
  id: string
  user_id: string
  started_at: string
  expires_at: string
  route_id: string | null
  user: { username: string, display_name: string | null, avatar_path: string | null } | null
  route: { id: string, name: string } | null
  live_positions: { fixed_at: string }[]
}

export function toLiveShareSummary(row: LiveShareRow, userId: string): LiveShareSummary {
  return {
    id: row.id,
    user_name: row.user?.display_name ?? row.user?.username ?? '',
    user_avatar_path: row.user?.avatar_path ?? null,
    is_mine: row.user_id === userId,
    route: row.route,
    follows_route: row.route_id !== null,
    started_at: row.started_at,
    expires_at: row.expires_at,
    last_fixed_at: row.live_positions[0]?.fixed_at ?? null,
  }
}

// An invalid uuid would otherwise surface as a Postgres error: report it as a share that has ended.
export function getLiveShareIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!z.uuid().safeParse(id).success) throw apiError(event, 404, 'api.liveShareNotFound')
  return id!
}
