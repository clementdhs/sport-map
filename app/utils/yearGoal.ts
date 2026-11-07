import type { StatsOuting } from '#shared/types/routes'
import { localDate } from '#shared/utils/outings'
import { SPORT_TYPES, type SportType } from '#shared/utils/routes'

// The member's personal goal for the year (#141): a distance, a gain or a number of outings, for every sport or
// one, shown as a gauge on their own profile with how far ahead or behind the steady pace they are. Kept in the
// member's account with their preferences (app/utils/preferences.ts), so it is private and on every device; it
// applies to the current year, and carries on to the next one until changed.

export const GOAL_METRICS = ['distance', 'gain', 'outings'] as const
export type GoalMetric = typeof GOAL_METRICS[number]

export interface YearGoal {
  metric: GoalMetric
  // In km for a distance, m for a gain
  target: number
  // null: every sport
  sport: SportType | null
}

// Suggested when the member picks the measure, and the largest target accepted.
export const GOAL_DEFAULTS: Record<GoalMetric, number> = { distance: 1000, gain: 20_000, outings: 100 }
export const GOAL_MAX: Record<GoalMetric, number> = { distance: 100_000, gain: 2_000_000, outings: 5000 }

// The saved goal, or none for anything unknown or damaged (the account may hold one from an older version).
export function parseYearGoal(value: unknown): YearGoal | null {
  if (!value || typeof value !== 'object') return null
  const saved = value as Record<string, unknown>
  const metric = GOAL_METRICS.find(m => m === saved.metric)
  if (!metric || typeof saved.target !== 'number' || !Number.isFinite(saved.target)) return null
  const target = metric === 'outings' ? Math.round(saved.target) : saved.target
  if (target <= 0 || target > GOAL_MAX[metric]) return null
  return { metric, target, sport: SPORT_TYPES.find(sport => sport === saved.sport) ?? null }
}

export interface GoalProgress {
  year: number
  // Done so far this year, in the goal's unit
  done: number
  target: number
  // What the steady pace gives at the end of today
  expected: number
  // done - expected: positive when ahead
  gap: number
  reached: boolean
  // Still to do each week to reach it by 31 December; 0 once reached
  perWeek: number
}

const DAY_MS = 86_400_000
const dayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS

function goalValue(outing: StatsOuting, metric: GoalMetric): number {
  if (metric === 'distance') return outing.distance_m / 1000
  return metric === 'gain' ? outing.elevation_gain_m ?? 0 : 1
}

// Progress of the goal on the profile's outings, with French local dates like the year's summary.
export function goalProgress(goal: YearGoal, outings: StatsOuting[], now = new Date()): GoalProgress {
  const today = localDate(now)
  const year = today.slice(0, 4)
  let done = 0
  for (const outing of outings) {
    if (goal.sport && outing.sport_type !== goal.sport) continue
    if (!localDate(outing.completed_at).startsWith(year)) continue
    done += goalValue(outing, goal.metric)
  }
  const first = dayIndex(`${year}-01-01`)
  const daysInYear = dayIndex(`${Number(year) + 1}-01-01`) - first
  // Today counts as elapsed: on 31 December the whole goal is expected.
  const elapsed = dayIndex(today) - first + 1
  const expected = (goal.target * elapsed) / daysInYear
  const left = daysInYear - elapsed
  const remaining = Math.max(goal.target - done, 0)
  return {
    year: Number(year),
    done,
    target: goal.target,
    expected,
    gap: done - expected,
    reached: done >= goal.target,
    // On the last day, what is left is due today.
    perWeek: remaining && (remaining * 7) / Math.max(left, 1),
  }
}

// The year goal drawn as a trail (#236), in a GOAL_TRAIL_WIDTH × GOAL_TRAIL_HEIGHT box: a gentle wave from the
// 1st of January on the left to the finish signpost on the right, solid as far as the member went, dashed beyond.
export const GOAL_TRAIL_WIDTH = 340
export const GOAL_TRAIL_HEIGHT = 72
export const GOAL_TRAIL_END = 300
const TRAIL_START = 8
const TRAIL_STEP = 4

export function goalTrailY(x: number): number {
  const t = (x - TRAIL_START) / (GOAL_TRAIL_END - TRAIL_START)
  return 44 + 7 * Math.sin(t * 2.6 * Math.PI) - 6 * t
}

export function goalTrailX(fraction: number): number {
  return TRAIL_START + Math.min(Math.max(fraction, 0), 1) * (GOAL_TRAIL_END - TRAIL_START)
}

const round = (value: number) => Math.round(value * 10) / 10

// SVG path of the trail between two fractions of it (0 the start, 1 the finish).
export function goalTrailPath(from: number, to: number): string {
  const start = goalTrailX(from)
  const end = goalTrailX(to)
  if (end <= start) return ''
  const xs = [start]
  for (let x = Math.ceil(start / TRAIL_STEP) * TRAIL_STEP; x < end; x += TRAIL_STEP) if (x > start) xs.push(x)
  xs.push(end)
  return xs.map((x, i) => `${i ? 'L' : 'M'}${round(x)} ${round(goalTrailY(x))}`).join('')
}
