import type { ProfileSummary, StatsOuting } from '../types/routes'

// Local date (YYYY-MM-DD) in France, so that a Sunday evening outing stays in its week, and a New Year's Eve
// one in its year.
export function localDate(instant: string | Date): string {
  return PARIS_DATE.format(new Date(instant))
}
// Built once: statistics and records date every outing at each change of filter.
const PARIS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })

// When an outing ended, from its start and elapsed time.
export function outingEnd(startedAt: string, durationS: number): string {
  return new Date(Date.parse(startedAt) + durationS * 1000).toISOString()
}

// What the profile statistics count: every outing recorded on a route, plus once each route only marked as
// done (a route recorded or followed with the GPS is also marked as done: it isn't counted twice). Latest first.
export function statsOutings<T extends StatsOuting>(recorded: T[], markedDone: T[]): T[] {
  const recordedRoutes = new Set(recorded.map(outing => outing.route_id))
  return [...recorded, ...markedDone.filter(done => !recordedRoutes.has(done.route_id))]
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
}

// Totals of the outings of the current year, for the summary at the top of a profile.
export function yearSummary(outings: StatsOuting[], now = new Date()): ProfileSummary {
  const year = localDate(now).slice(0, 4)
  const summary: ProfileSummary = { year: Number(year), distance_m: 0, outings: 0, elevation_gain_m: 0 }
  for (const outing of outings) {
    if (!localDate(outing.completed_at).startsWith(year)) continue
    summary.distance_m += outing.distance_m
    summary.elevation_gain_m += outing.elevation_gain_m ?? 0
    summary.outings++
  }
  return summary
}

// Gap between an outing's moving time and the route's estimated duration, in minutes rounded to 5 like the
// estimate: negative when faster, 0 when as estimated.
export function estimateGapMin(movingS: number, estimateMin: number): number {
  return Math.round((movingS / 60 - estimateMin) / 5) * 5 || 0
}

// Two outings of a member starting within this many seconds are the same one (#268): an imported file is skipped
// when the member already has it, imported earlier or recorded by the app at the same time as by a watch.
export const IMPORT_SAME_START_S = 60
