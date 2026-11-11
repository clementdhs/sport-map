import type { RecordOuting } from '../types/routes'
import { localDate } from './outings'
import { DEFAULT_PACES, SPORT_KINDS } from './routes'

// The coach's easy pace (#281): the pace of the endurance blocks, which sizes every session's distance and gain.
// The member's own running pace when they set one (#146), else one worked out from their recent runs, else the
// default one. Pure, computed in the browser from the profile's outings.

export type PaceOuting = Pick<RecordOuting, 'sport_type' | 'distance_m' | 'elevation_gain_m' | 'completed_at' | 'moving_s'>
  & Partial<Pick<RecordOuting, 'covered_m'>>

export type PaceSource = 'settings' | 'outings' | 'default'

export type CoachPace = {
  // min/km on the flat
  pace: number
  source: PaceSource
}

// The runs looked at: the latest ones, within these weeks, long enough for their pace to mean something.
export const PACE_OUTINGS = 5
export const PACE_WEEKS = 8
export const PACE_MIN_OUTINGS = 2
const MIN_DISTANCE_M = 2000
// The easy pace is slower than the usual outing: most runners run their outings faster than their easy pace.
export const EASY_PACE_FACTOR = 1.15
// Paces outside these bounds (min/km) are GPS or input errors: a walk recorded as a run, a forgotten stop.
const MIN_PACE = 3
const MAX_PACE = 12

// Pace of an outing in km-effort (min/km): 100 m of gain cost a km, like the sessions (coachSessions.ts), so a
// hilly run and a flat one compare. The GPS distance when there is one, the route's otherwise; the gain is the
// route's, taken in proportion when the outing covered less of it (stopped on the way).
function effortPace(outing: PaceOuting): number | null {
  if (!outing.moving_s) return null
  const distanceM = outing.covered_m ?? outing.distance_m
  if (distanceM < MIN_DISTANCE_M) return null
  const share = outing.distance_m > 0 ? Math.min(1, distanceM / outing.distance_m) : 1
  const km = distanceM / 1000 + (Math.max(0, outing.elevation_gain_m ?? 0) * share) / 100
  const pace = outing.moving_s / 60 / km
  return pace >= MIN_PACE && pace <= MAX_PACE ? pace : null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

// The easy pace worked out from the member's latest runs (road and trail, recorded with the GPS): the median of
// their km-effort paces, slowed down by EASY_PACE_FACTOR. Null with fewer than PACE_MIN_OUTINGS runs.
export function outingsEasyPace(outings: PaceOuting[], now = new Date()): number | null {
  const since = localDate(new Date(now.getTime() - PACE_WEEKS * 7 * 86_400_000))
  const today = localDate(now)
  const paces = outings
    .filter(o => SPORT_KINDS[o.sport_type] === 'run')
    .filter((o) => {
      const date = localDate(o.completed_at)
      return date >= since && date <= today
    })
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
    .map(effortPace)
    .filter((pace): pace is number => pace !== null)
    .slice(0, PACE_OUTINGS)
  if (paces.length < PACE_MIN_OUTINGS) return null
  // To the second, like the paces of the settings
  return Math.round(median(paces) * EASY_PACE_FACTOR * 60) / 60
}

export function coachPace(outings: PaceOuting[], setting: number | null | undefined, now = new Date()): CoachPace {
  if (setting) return { pace: setting, source: 'settings' }
  const fromOutings = outingsEasyPace(outings, now)
  if (fromOutings) return { pace: fromOutings, source: 'outings' }
  return { pace: DEFAULT_PACES.running, source: 'default' }
}
