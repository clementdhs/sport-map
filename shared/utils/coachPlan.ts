import type { CoachGoal } from '../types/account'
import type { StatsOuting } from '../types/routes'
import { DEFAULT_OUTINGS_PER_WEEK } from './coachGoal'
import {
  DEFAULT_SESSION_DURATION,
  KEY_SESSIONS,
  LONG_RUN_MINUTES,
  type SessionChoice,
  type SessionDuration,
  sessionLoad,
  sessionOn,
} from './coachSessions'
import { isoWeekday, weekStart } from './coachWeek'
import { localDate } from './outings'
import { countsForForm, type LoadOuting, outingLoad } from './trainingForm'

// The member's week (#285): the 7 days of the calendar week, what was done or skipped on the past ones and the
// session the coach plans on each outing day left. Never fixed: worked out again from the outings each time, so a
// skipped session isn't made up for and the rest of the week moves with what the member really ran.

export type DayChoice = { minutes: SessionDuration, other: number }

// The outings of the form, with their moving time when the page has it
export type PlanOuting = LoadOuting & Partial<Pick<StatsOuting, 'moving_s'>>

export type PlanDayState =
  // An outing counted in the form that day
  | 'done'
  // A past day among the member's days (#283) without any outing
  | 'skipped'
  // Not an outing day
  | 'rest'
  // An outing day to come (today included while nothing is recorded)
  | 'planned'

export type PlanDay = {
  // French local date and ISO weekday (1 = Monday)
  date: string
  weekday: number
  past: boolean
  today: boolean
  state: PlanDayState
  // The day's outings: their load (km-effort), distance (m) and moving time (s, GPS outings only)
  load: number
  distanceM: number
  movingS: number
  // The session planned that day: outing days from today on (today's even once done, so it stays the same all day)
  session: SessionChoice | null
}

// The duration a day starts with until the member picks one: the long run's on their long run day.
export function defaultMinutes(goal: CoachGoal | null, date: string): SessionDuration {
  return goal?.long_run_day === isoWeekday(date) ? LONG_RUN_MINUTES : DEFAULT_SESSION_DURATION
}

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

// `count` days among `days`, spread as evenly as can be, the first one first.
function spread(days: string[], count: number): string[] {
  if (count <= 0) return []
  if (count >= days.length) return days
  return Array.from({ length: count }, (_, k) => days[Math.floor((k * days.length) / count)]!)
}

export type PlanInput = {
  goal: CoachGoal | null
  easyPace: number
  // The duration and « Autre séance » clicks chosen for a day, defaultMinutes and none without a choice
  choiceOf: (date: string) => DayChoice | null
}

// The week of `day` (a French local date), as of `now`.
export function weekPlan(outings: PlanOuting[], input: PlanInput, day: string, now = new Date()): PlanDay[] {
  const today = localDate(now)
  const start = weekStart(day)
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const goal = input.goal

  const byDate = new Map<string, { load: number, distanceM: number, movingS: number }>()
  for (const outing of outings) {
    if (!countsForForm(outing)) continue
    const date = localDate(outing.completed_at)
    if (date < start || date > dates[6]!) continue
    const sums = byDate.get(date) ?? { load: 0, distanceM: 0, movingS: 0 }
    sums.load += outingLoad(outing)
    sums.distanceM += outing.distance_m
    sums.movingS += outing.moving_s ?? 0
    byDate.set(date, sums)
  }

  // The outing days still to come: the member's days from today on, else their outings a week less those run,
  // spread over the days left (today first while nothing is recorded today).
  const preferred = goal?.preferred_days ?? []
  const ranBefore = dates.filter(date => date < today && byDate.has(date)).length
  const ranToday = byDate.has(today)
  const ahead = dates.filter(date => date >= today)
  const planned = new Set(preferred.length
    ? ahead.filter(date => preferred.includes(isoWeekday(date)))
    : [
        ...(ranToday ? [today] : []),
        ...spread(ahead.filter(date => date !== today || !ranToday),
          (goal?.outings_per_week ?? DEFAULT_OUTINGS_PER_WEEK) - ranBefore - (ranToday ? 1 : 0)),
      ])
  const plannedDates = dates.filter(date => planned.has(date))

  // Today's session as it was before today's outings, so it stays the same once one is recorded, like the review
  // after it (#267), which works it out without the outing
  const beforeToday = byDate.has(today) ? outings.filter(o => localDate(o.completed_at) !== today) : outings

  const days: PlanDay[] = []
  let plannedLoad = 0
  let plannedBefore = 0
  for (const date of dates) {
    const sums = byDate.get(date) ?? { load: 0, distanceM: 0, movingS: 0 }
    const past = date < today
    let session: SessionChoice | null = null
    if (!past && planned.has(date)) {
      const choice = input.choiceOf(date) ?? { minutes: defaultMinutes(goal, date), other: 0 }
      const previous = days.at(-1)
      session = sessionOn(date === today ? beforeToday : outings, { goal, minutes: choice.minutes, easyPace: input.easyPace }, date, choice.other, {
        plannedBefore,
        plannedLoad,
        outingsLeft: plannedDates.filter(d => d >= date).length,
        afterHard: !!previous?.session && KEY_SESSIONS.includes(previous.session.plan.kind),
        longRunDay: goal?.long_run_day === isoWeekday(date),
      })
      // Today's outing already counts as done in the week; the days after count the sessions planned before them.
      if (date > today || !byDate.has(date)) {
        plannedLoad += sessionLoad(session.plan)
        plannedBefore++
      }
    }
    const state: PlanDayState = byDate.has(date)
      ? 'done'
      : past
        ? preferred.includes(isoWeekday(date)) ? 'skipped' : 'rest'
        : planned.has(date) ? 'planned' : 'rest'
    days.push({ date, weekday: isoWeekday(date), past, today: date === today, state, ...sums, session })
  }
  return days
}

// The session of `day` (today or later): the one the week plan puts there, else, on a rest day, the session of
// the day the rules would give if the member goes out anyway.
export function daySession(outings: PlanOuting[], input: PlanInput, day: string, now = new Date()): SessionChoice {
  const planned = weekPlan(outings, input, day, now).find(d => d.date === day)?.session
  if (planned) return planned
  const choice = input.choiceOf(day) ?? { minutes: defaultMinutes(input.goal, day), other: 0 }
  return sessionOn(outings, { goal: input.goal, minutes: choice.minutes, easyPace: input.easyPace }, day, choice.other)
}
