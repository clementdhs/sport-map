import * as z from 'zod'
import type { CoachGoal } from '../types/account'
import { localDate } from './outings'

// The coach's goal (#264): ease back in, progress, or get ready for a race (its date, distance and gain). It steers
// the session of the day (coachSessions.ts). Kept in `coach_goals`, one row per member.

export const COACH_GOAL_KINDS = ['resume', 'progress', 'race'] as const
export type CoachGoalKind = typeof COACH_GOAL_KINDS[number]

// The bounds of the table's checks, in the units typed: km and m.
export const RACE_DISTANCE_KM = { min: 1, max: 300 } as const
export const RACE_GAIN_M = { min: 0, max: 20000 } as const
// A race further away than this is a typo rather than a goal.
export const RACE_MAX_DAYS_AHEAD = 730

// The member's week (#283): outings a week, as the table's check, 3 until they say.
export const OUTINGS_PER_WEEK = { min: 2, max: 6 } as const
export const DEFAULT_OUTINGS_PER_WEEK = 3
// ISO weekdays, Monday first
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

// The short name of an ISO weekday (1 = Monday) in `locale`: « lun. », "Mon".
export function weekdayName(day: number, locale: string): string {
  // 9 November 2026 is a Monday
  return new Date(Date.UTC(2026, 10, 8 + day, 12)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })
}

const DAY_MS = 86_400_000
const toUtc = (date: string) => Date.parse(`${date}T12:00:00Z`)

// Days from `today` to the race (0 on race day, negative once it is past), both French local dates.
export function daysUntil(date: string, today: string): number {
  return Math.round((toUtc(date) - toUtc(today)) / DAY_MS)
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/

const weekday = z.number().int().min(1).max(7)
// Defaults for a page loaded before #283, which only sends the goal
const week = {
  outings_per_week: z.number('validation.outingsPerWeekRange').int()
    .min(OUTINGS_PER_WEEK.min, 'validation.outingsPerWeekRange')
    .max(OUTINGS_PER_WEEK.max, 'validation.outingsPerWeekRange')
    .default(DEFAULT_OUTINGS_PER_WEEK),
  preferred_days: z.array(weekday).max(7).default([]),
  long_run_day: weekday.nullable().default(null),
}

// The body of PUT /api/profile/me/coach-goal, and the goal form: the race fields only for a race. The date can't be
// in the past (French local date), so a race just saved always lies ahead. The days, when given, are as many as the
// outings, and the long run is on one of them.
export const coachGoalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resume'), ...week }),
  z.object({ kind: z.literal('progress'), ...week }),
  z.object({
    kind: z.literal('race'),
    ...week,
    race_date: z.string('validation.raceDateRequired')
      .regex(isoDate, 'validation.raceDateRequired')
      .refine(date => !Number.isNaN(toUtc(date)), 'validation.raceDateRequired')
      .refine(date => daysUntil(date, localDate(new Date())) >= 0, 'validation.raceDatePast')
      .refine(date => daysUntil(date, localDate(new Date())) <= RACE_MAX_DAYS_AHEAD, 'validation.raceDateFar'),
    race_distance_m: z.number('validation.raceDistanceRequired')
      .int()
      .min(RACE_DISTANCE_KM.min * 1000, 'validation.raceDistanceRange')
      .max(RACE_DISTANCE_KM.max * 1000, 'validation.raceDistanceRange'),
    race_gain_m: z.number().int()
      .min(RACE_GAIN_M.min, 'validation.raceGainRange')
      .max(RACE_GAIN_M.max, 'validation.raceGainRange')
      .nullable()
      .optional(),
  }),
]).superRefine((goal, ctx) => {
  const days = new Set(goal.preferred_days)
  if (days.size && days.size !== goal.outings_per_week) {
    ctx.addIssue({ code: 'custom', path: ['preferred_days'], message: 'validation.preferredDaysCount' })
  }
  if (goal.long_run_day !== null && days.size && !days.has(goal.long_run_day)) {
    ctx.addIssue({ code: 'custom', path: ['long_run_day'], message: 'validation.longRunDay' })
  }
})

export type CoachGoalPayload = z.infer<typeof coachGoalSchema>

// The row a payload saves: the race fields null for the other goals, the days sorted without duplicates.
export function coachGoalRow(payload: CoachGoalPayload): CoachGoal {
  const week = {
    outings_per_week: payload.outings_per_week,
    preferred_days: [...new Set(payload.preferred_days)].sort((a, b) => a - b),
    long_run_day: payload.long_run_day,
  }
  if (payload.kind !== 'race') return { kind: payload.kind, race_date: null, race_distance_m: null, race_gain_m: null, ...week }
  return {
    kind: 'race',
    race_date: payload.race_date,
    race_distance_m: payload.race_distance_m,
    race_gain_m: payload.race_gain_m ?? null,
    ...week,
  }
}

// A goal read back from the table (its kind is a text column), null when it isn't one the app knows.
export function parseCoachGoal(row: CoachGoal | null): CoachGoal | null {
  if (!row || !(COACH_GOAL_KINDS as readonly string[]).includes(row.kind)) return null
  if (row.kind === 'race' && (!row.race_date || !row.race_distance_m)) return null
  return row
}
