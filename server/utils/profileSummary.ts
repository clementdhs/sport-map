import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { ProfileSummary } from '#shared/types/routes'

// The current year's totals of a member, counted like their own statistics tab: every outing recorded with the
// GPS, plus the routes only marked as done. RLS hides another member's marks and their outings on private
// routes, hence the service role; only the three totals leave the server. Like the member's own statistics, an
// outing on a route that another owner has since made private no longer counts.
export async function memberYearSummary(event: H3Event, userId: string): Promise<ProfileSummary | null> {
  const supabase = serverSupabaseServiceRole<Database>(event)
  const columns = 'route:routes(sport_type, distance_m, elevation_gain_m, is_public, owner_id)'
  const [recorded, done] = await Promise.all([
    supabase.from('route_outings').select(`route_id, started_at, duration_s, ${columns}`).eq('user_id', userId),
    supabase.from('route_activity').select(`route_id, completed_at, ${columns}`).eq('user_id', userId).eq('activity_type', 'completed'),
  ])
  if (!recorded.data || !done.data) {
    console.error('[memberYearSummary]', recorded.error ?? done.error)
    return null
  }

  const visible = (route: { is_public: boolean, owner_id: string } | null) => !!route && (route.is_public || route.owner_id === userId)

  return yearSummary(statsOutings(
    recorded.data.filter(o => visible(o.route)).map(o => ({
      ...o.route!,
      route_id: o.route_id,
      completed_at: outingEnd(o.started_at, o.duration_s),
      moving_s: null,
    })),
    done.data.filter(a => visible(a.route) && a.completed_at).map(a => ({
      ...a.route!,
      route_id: a.route_id,
      completed_at: a.completed_at!,
      moving_s: null,
    })),
  ))
}
