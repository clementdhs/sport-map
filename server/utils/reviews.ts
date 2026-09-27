import type { H3Event } from 'h3'
import * as z from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { RouteReview, RouteReviews } from '#shared/types/routes'

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

// Shared by the /api/routes/:id/reviews handlers. requireUser: mutations need a signed-in user.
export async function reviewContext(event: H3Event, { requireUser = false } = {}) {
  const user = await serverSupabaseUser(event)
  if (requireUser && !user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  return { routeId: getRouteIdParam(event), userId: user?.sub ?? null, supabase: await serverSupabaseClient(event) }
}

export function getReviewIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'reviewId')
  if (!z.uuid().safeParse(id).success) throw createError({ statusCode: 404, statusMessage: 'Avis introuvable' })
  return id!
}

// profiles is named through its foreign key: review_reports also links reviews to profiles (reporters).
// The reviews of a route as the viewer may see them (RLS hides the hidden ones from others), their own
// first, then the most recent. Mutations return it too, so the page just replaces its state.
export async function loadRouteReviews(supabase: Supabase, routeId: string, userId: string | null): Promise<RouteReviews> {
  const [route, reviews] = await Promise.all([
    supabase.from('routes').select('owner_id, rating_avg, rating_count').eq('id', routeId).maybeSingle(),
    supabase
      .from('route_reviews')
      .select(`
        id, rating, comment, created_at, updated_at, user_id, hidden_reason,
        author:profiles!route_reviews_user_id_fkey(username, display_name),
        reports:review_reports(reporter_id)
      `)
      .eq('route_id', routeId)
      .order('created_at', { ascending: false }),
  ])

  if (route.error || reviews.error) {
    console.error('[reviews] load', route.error ?? reviews.error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de charger les avis' })
  }
  if (!route.data) throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })

  // Reports are only readable by their author and the route's owner (RLS).
  const isOwner = userId === route.data.owner_id
  const list: RouteReview[] = reviews.data.map(({ user_id, reports, hidden_reason, ...review }) => ({
    ...review,
    is_mine: user_id === userId,
    hidden_reason: hidden_reason as RouteReview['hidden_reason'],
    reported_by_me: !!userId && reports.some(report => report.reporter_id === userId),
    report_count: isOwner ? reports.length : null,
  }))
  list.sort((a, b) => Number(b.is_mine) - Number(a.is_mine))

  return { rating_avg: route.data.rating_avg, rating_count: route.data.rating_count, reviews: list }
}
