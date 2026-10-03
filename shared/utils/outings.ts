import type { StatsOuting } from '../types/routes'

// When an outing ended, from its start and elapsed time.
export function outingEnd(startedAt: string, durationS: number): string {
  return new Date(Date.parse(startedAt) + durationS * 1000).toISOString()
}

// What the profile statistics count: every outing recorded on a route, plus once each route only marked as
// done (a route recorded or followed with the GPS is also marked as done: it isn't counted twice). Latest first.
export function statsOutings(recorded: StatsOuting[], markedDone: StatsOuting[]): StatsOuting[] {
  const recordedRoutes = new Set(recorded.map(outing => outing.route_id))
  return [...recorded, ...markedDone.filter(done => !recordedRoutes.has(done.route_id))]
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
}

// Gap between an outing's moving time and the route's estimated duration, in minutes rounded to 5 like the
// estimate: negative when faster, 0 when as estimated.
export function estimateGapMin(movingS: number, estimateMin: number): number {
  return Math.round((movingS / 60 - estimateMin) / 5) * 5 || 0
}
