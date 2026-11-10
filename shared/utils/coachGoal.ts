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

const DAY_MS = 86_400_000
const toUtc = (date: string) => Date.parse(`${date}T12:00:00Z`)

// Days from `today` to the race (0 on race day, negative once it is past), both French local dates.
export function daysUntil(date: string, today: string): number {
  return Math.round((toUtc(date) - toUtc(today)) / DAY_MS)
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/

// The body of PUT /api/profile/me/coach-goal, and the goal form: the race fields only for a race. The date can't be
// in the past (French local date), so a race just saved always lies ahead.
export const coachGoalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resume') }),
  z.object({ kind: z.literal('progress') }),
  z.object({
    kind: z.literal('race'),
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
])

export type CoachGoalPayload = z.infer<typeof coachGoalSchema>

// The row a payload saves: the race fields null for the other goals.
export function coachGoalRow(payload: CoachGoalPayload): CoachGoal {
  if (payload.kind !== 'race') return { kind: payload.kind, race_date: null, race_distance_m: null, race_gain_m: null }
  return {
    kind: 'race',
    race_date: payload.race_date,
    race_distance_m: payload.race_distance_m,
    race_gain_m: payload.race_gain_m ?? null,
  }
}

// A goal read back from the table (its kind is a text column), null when it isn't one the app knows.
export function parseCoachGoal(row: CoachGoal | null): CoachGoal | null {
  if (!row || !(COACH_GOAL_KINDS as readonly string[]).includes(row.kind)) return null
  if (row.kind === 'race' && (!row.race_date || !row.race_distance_m)) return null
  return row
}
