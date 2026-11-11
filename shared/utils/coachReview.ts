import * as z from 'zod'
import { type LngLat, type OutingTrackPoint, smoothByDistance, trackDistances } from './routes'
import { climbs } from './slopes'
import { daySession, type PlanInput, type PlanOuting } from './coachPlan'
import { coachDays, type SessionPlan } from './coachSessions'
import { type FormState, FEELINGS, type LoadOuting, trainingForm } from './trainingForm'

// The coach's review after an outing (#267, mockup 4): whether it was the session of the day, the time of each
// repeat of a hill or interval session, and what the outing does to the form. Pure, from the outings of the
// profile and the outing's GPS points.

export const outingFeelingSchema = z.object({ feeling: z.enum(FEELINGS).nullable() })

// An outing is the session of the day when it followed the route traced for it (#266), or else when its moving
// time is within a quarter of the session's, 10 min at least.
const MATCH_SHARE = 0.25
const MATCH_MIN_MINUTES = 10
// Half the window smoothByDistance averages elevations over
const SMOOTHING_HALF_M = 50
// GPS altitudes this close are the same height
const EVEN_M = 0.5

export function matchesSession(plan: SessionPlan, movingS: number | null, onSessionRoute = false): boolean {
  if (!plan.minutes) return false
  if (onSessionRoute) return true
  if (movingS === null) return false
  return Math.abs(movingS / 60 - plan.minutes) <= Math.max(MATCH_MIN_MINUTES, plan.minutes * MATCH_SHARE)
}

export type RepeatTimes = {
  // hills: the time of each climb (s); fast: the pace of each effort (s/km)
  kind: 'hills' | 'fast'
  values: number[]
}

// First point at `meters` along the track or beyond.
function indexAt(along: number[], meters: number): number {
  let low = 0
  let high = along.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (along[mid]! < meters) low = mid + 1
    else high = mid
  }
  return low
}

// Hill repeats: the climbs of the track, found with a gain and a tolerance of dips sized on the session's own
// hills (a short hill gains about 10 m), the largest `count` of them in order, timed in moving time.
function hillTimes(track: OutingTrackPoint[], plan: SessionPlan): number[] {
  if (track.some(point => point[2] === null)) return []
  const expected = plan.blocks.find(block => block.kind === 'effort')?.gainM ?? 0
  const coordinates = track.map(([lng, lat]) => [lng, lat] as LngLat)
  const elevations = track.map(point => point[2]!)
  const along = trackDistances(coordinates)
  const smoothed = smoothByDistance(coordinates, elevations)
  const found = climbs(coordinates, elevations, along, Math.max(4, expected * 0.4), Math.min(20, Math.max(3, expected * 0.3)))
  return found
    .map((climb, order) => ({ climb, order }))
    .sort((a, b) => b.climb.gainM - a.climb.gainM)
    .slice(0, plan.reps!.count)
    .sort((a, b) => a.order - b.order)
    .map(({ climb }) => {
      const [low, high] = climbEnds(elevations, smoothed, along, indexAt(along, climb.startM), indexAt(along, climb.endM))
      return track[high]![4] - track[low]![4]
    })
}

// Where a climb really starts and ends. climbs() gives the extremes of the smoothed elevations, which a flat
// warm-up (and its bumps) drags back to its start and the smoothing rounds off: from the first smoothed point near
// its top and the last one near its low point before it (within 5 % of its gain), the GPS points within half the smoothing window, the latest
// one at the lowest altitude and the first one at the highest (give or take EVEN_M).
function climbEnds(elevations: number[], smoothed: number[], along: number[], start: number, end: number): [number, number] {
  const margin = (smoothed[end]! - smoothed[start]!) * 0.05
  let top = start
  while (top < end && smoothed[top]! < smoothed[end]! - margin) top++
  let bottom = top
  while (bottom > start && smoothed[bottom]! > smoothed[start]! + margin) bottom--
  const around = (center: number, from: number, to: number) => {
    const indices: number[] = []
    for (let i = from; i <= to; i++) if (Math.abs(along[i]! - along[center]!) <= SMOOTHING_HALF_M) indices.push(i)
    return indices
  }
  const lows = around(bottom, start, top)
  const lowest = Math.min(...lows.map(i => elevations[i]!))
  let low = lows[0]!
  for (const i of lows) if (elevations[i]! <= lowest + EVEN_M) low = i
  const highs = around(top, low, elevations.length - 1)
  const highest = Math.max(...highs.map(i => elevations[i]!))
  return [low, highs.find(i => elevations[i]! >= highest - EVEN_M) ?? top]
}

// Intervals: the `count` fastest stretches of the effort's length in moving time, never overlapping, in order,
// each as its pace.
function fastPaces(track: OutingTrackPoint[], plan: SessionPlan): number[] {
  const effortS = plan.reps!.effortMin * 60
  const along = trackDistances(track.map(([lng, lat]) => [lng, lat] as LngLat))
  // Each start point's stretch: the first point at least effortS of moving time later.
  const stretches: { start: number, end: number, metersPerS: number }[] = []
  let end = 0
  for (let start = 0; start < track.length; start++) {
    while (end < track.length && track[end]![4] - track[start]![4] < effortS) end++
    if (end >= track.length) break
    const seconds = track[end]![4] - track[start]![4]
    stretches.push({ start, end, metersPerS: (along[end]! - along[start]!) / seconds })
  }
  stretches.sort((a, b) => b.metersPerS - a.metersPerS)
  const picked: typeof stretches = []
  for (const stretch of stretches) {
    if (picked.length === plan.reps!.count) break
    if (picked.some(p => stretch.start < p.end && p.start < stretch.end)) continue
    picked.push(stretch)
  }
  return picked
    .filter(stretch => stretch.metersPerS > 0)
    .sort((a, b) => a.start - b.start)
    .map(stretch => 1000 / stretch.metersPerS)
}

// The time of each repeat of a hill or interval session, null for other sessions or when fewer than 2 are found.
export function repeatTimes(track: OutingTrackPoint[], plan: SessionPlan): RepeatTimes | null {
  if (!plan.reps || track.length < 2) return null
  const kind = plan.reps.hill ? 'hills' : 'fast'
  const values = (kind === 'hills' ? hillTimes(track, plan) : fastPaces(track, plan)).map(Math.round)
  return values.length >= 2 ? { kind, values } : null
}

// Spread between the fastest and the slowest repeat against their median: very regular up to 8 % (14 s on 3 min
// hills, as on the mockup), regular up to 15 %. The last one being the slowest is said apart: it is normal.
export type Regularity = {
  level: 'veryRegular' | 'regular' | 'irregular'
  // Slowest − fastest, s (hills) or s/km (intervals)
  spread: number
  lastSlowest: boolean
}

export function regularity(values: number[]): Regularity {
  const sorted = [...values].sort((a, b) => a - b)
  const spread = sorted.at(-1)! - sorted[0]!
  const median = sorted[Math.floor(sorted.length / 2)]!
  const share = median > 0 ? spread / median : 0
  return {
    level: share <= 0.08 ? 'veryRegular' : share <= 0.15 ? 'regular' : 'irregular',
    spread,
    lastSlowest: spread > 0 && values.at(-1) === sorted.at(-1),
  }
}

export type FormEffect = {
  // The form without the outing, then with it (load ÷ baseline, null while learning)
  before: number | null
  after: number | null
  state: FormState
}

// What the outing does to the form of the moment: the form without it, then with it, its feeling included.
export function formEffect<T extends LoadOuting>(outings: T[], outing: T, now = new Date()): FormEffect {
  const before = trainingForm(outings.filter(o => o !== outing), now)
  const after = trainingForm(outings, now)
  return { before: before.ratio, after: after.ratio, state: after.state }
}

// Tomorrow's session if the member doesn't go out again today: the one the week plan (#285) puts there, with
// today's outing among the days before and the choices kept for the days (#279), else on a rest day the session
// the rules would give.
export function tomorrowSession(outings: PlanOuting[], input: PlanInput, now = new Date()): SessionPlan {
  return daySession(outings, input, coachDays(now)[1]!, now).plan
}
