import type { ProfileSummary, StatsOuting } from '../types/routes'
import type { LngLat } from './routes'

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

// An outing imported on a route (#138) must have been done on it: most of its points near the track, and most of
// the track near its points, either way round. A detour or a GPS drift may leave a fifth of either away from the
// other; an outing done elsewhere, only partly on the route or going on far past it is refused.
export const FOLLOW_TOLERANCE_M = 50
export const FOLLOW_MIN_SHARE = 0.8
// Points compared on each side: enough for a fifth of a long track, cheap against a 10,000-point line.
const FOLLOW_SAMPLES = 300

export function outingFollowsRoute(outing: LngLat[], route: LngLat[]): boolean {
  if (outing.length < 2 || route.length < 2) return false
  // A flat frame in metres around the route's start: plenty precise over the few kilometres of an outing.
  const [lng0, lat0] = route[0]!
  const kx = 111_320 * Math.cos(lat0 * Math.PI / 180)
  const flat = (points: LngLat[]) => points.map(([lng, lat]): [number, number] => [(lng - lng0) * kx, (lat - lat0) * 110_574])
  const a = flat(outing)
  const b = flat(route)
  return nearShare(a, b) >= FOLLOW_MIN_SHARE && nearShare(b, a) >= FOLLOW_MIN_SHARE
}

// The share of the `points` line (sampled evenly along its length, not by its points: a route drawn with dense
// points on a twisty stretch and few on a straight one must count both by their length) within FOLLOW_TOLERANCE_M
// of the `line`.
function nearShare(points: [number, number][], line: [number, number][]): number {
  const samples = alongSamples(points)
  return samples.filter(point => nearLine(point, line)).length / samples.length
}

function alongSamples(line: [number, number][]): [number, number][] {
  const cumulative = [0]
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]))
  }
  const total = cumulative.at(-1)!
  if (!total) return [line[0]!]
  const samples: [number, number][] = []
  let segment = 1
  for (let i = 0; i < FOLLOW_SAMPLES; i++) {
    const at = total * i / (FOLLOW_SAMPLES - 1)
    while (segment < line.length - 1 && cumulative[segment]! < at) segment++
    const [x1, y1] = line[segment - 1]!
    const [x2, y2] = line[segment]!
    const length = cumulative[segment]! - cumulative[segment - 1]!
    const t = length ? (at - cumulative[segment - 1]!) / length : 0
    samples.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)])
  }
  return samples
}

function nearLine([x, y]: [number, number], line: [number, number][]): boolean {
  const limit = FOLLOW_TOLERANCE_M ** 2
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1]!
    const [x2, y2] = line[i]!
    const dx = x2 - x1
    const dy = y2 - y1
    const length = dx * dx + dy * dy
    const t = length ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length)) : 0
    if ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= limit) return true
  }
  return false
}
