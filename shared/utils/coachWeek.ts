import type { CoachGoal } from '../types/account'
import { DEFAULT_OUTINGS_PER_WEEK } from './coachGoal'
import { localDate } from './outings'
import { countsForForm, type LoadOuting, outingLoad, trainingForm } from './trainingForm'
import { racePhase, TAPER_WEEK } from './racePhases'

// The week's volume (#284): how much the member is aiming for this calendar week (Monday to Sunday, French local
// dates), in km-effort, so their load grows week after week with a lighter one now and then. Nothing is stored:
// the target only depends on the outings before the week's Monday, so it stays the same all week.

// The target grows on the usual week: +10 %, +5 % when easing back in. Every 4th week of the member's history is
// a lighter one, at 70 % of the usual week.
export const WEEK_GROWTH = 1.1
export const RESUME_WEEK_GROWTH = 1.05
export const LIGHTER_WEEK = 0.7
export const LIGHTER_EVERY = 4
// A session may take this much more than its even share of what is left of the week: key sessions and the long
// run are bigger than the easy ones.
export const SESSION_SHARE = 1.5

const DAY_MS = 86_400_000
const noon = (date: string) => new Date(`${date}T12:00:00Z`)
const addDays = (date: string, days: number) => new Date(noon(date).getTime() + days * DAY_MS).toISOString().slice(0, 10)

// ISO weekday of a French local date: 1 = Monday … 7 = Sunday
export function isoWeekday(date: string): number {
  return noon(date).getUTCDay() || 7
}

// The Monday of `date`'s week
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date))
}

export type WeekVolume = {
  // Monday and Sunday of the week
  start: string
  end: string
  // km-effort aimed for this week
  target: number
  // km-effort of the week's outings until `day`, that day included
  done: number
  // The same before `day`, what the day's session is sized against
  doneBefore: number
  lighter: boolean
  // The race's taper (#286): the volume going down
  tapering: boolean
  // The outings still to come this week from `day` on, that day included: the member's days left, else the
  // outings a week less the days already run, at least 1
  outingsLeft: number
}

// The week of `day` (a French local date). Null while the member's usual week is unknown (fewer than 7 days of
// history).
export function weekVolume(outings: LoadOuting[], goal: CoachGoal | null, day: string): WeekVolume | null {
  const start = weekStart(day)
  const end = addDays(start, 6)
  // The usual week: the 4 full weeks before Monday (the baseline the form will judge on Sunday, which only counts
  // days before the week), else while learning the weekly average of the history until the Sunday before.
  const before = trainingForm(outings, noon(addDays(start, -1)))
  const weekly = trainingForm(outings, noon(end)).baseline ?? before.weekly
  if (weekly === null) return null
  // The weeks of history before this one: every 4th week is lighter.
  const lighter = Math.floor(before.historyDays / 7) % LIGHTER_EVERY === LIGHTER_EVERY - 1
  const growth = goal?.kind === 'resume' ? RESUME_WEEK_GROWTH : WEEK_GROWTH
  // Tapering for a race (#286): the volume goes down, whatever the cycle of lighter weeks
  const tapering = racePhase(goal, start)?.name === 'taper'
  const target = weekly * (tapering ? TAPER_WEEK : lighter ? LIGHTER_WEEK : growth)

  let done = 0
  let doneBefore = 0
  const runDays = new Set<string>()
  for (const outing of outings) {
    if (!countsForForm(outing)) continue
    const date = localDate(outing.completed_at)
    if (date < start || date > day) continue
    const load = outingLoad(outing)
    done += load
    if (date < day) {
      doneBefore += load
      runDays.add(date)
    }
  }

  const days = goal?.preferred_days ?? []
  const outingsLeft = days.length
    ? Math.max(1, days.filter(d => d >= isoWeekday(day)).length)
    : Math.max(1, (goal?.outings_per_week ?? DEFAULT_OUTINGS_PER_WEEK) - runDays.size)

  return { start, end, target, done, doneBefore, lighter: lighter && !tapering, tapering, outingsLeft }
}

// The most the day's session may weigh to keep the week on target (km-effort): its share of what is left, a bit
// more for a key session, never more than what is left. 0 once the week's target is reached.
export function weekSessionCap(week: WeekVolume): number {
  const left = Math.max(0, week.target - week.doneBefore)
  return Math.min(left, (left / week.outingsLeft) * SESSION_SHARE)
}
