import { describe, expect, it } from 'vitest'
import type { CoachGoal } from '#shared/types/account'
import { CAP_MIN_MINUTES, sessionOfTheDay, type CoachInput } from '#shared/utils/coachSessions'
import { isoWeekday, LIGHTER_WEEK, RESUME_WEEK_GROWTH, WEEK_GROWTH, weekSessionCap, weekStart, weekVolume } from '#shared/utils/coachWeek'
import { type LoadOuting, trainingForm } from '#shared/utils/trainingForm'

// Wednesday 11 November 2026; its week starts on Monday the 9th
const DAY = '2026-11-11'
const MONDAY = '2026-11-09'

// A 10 km run on `date` (a French local date), at noon in Paris
function run(date: string, km = 10): LoadOuting {
  return { sport_type: 'running', distance_m: km * 1000, elevation_gain_m: 0, completed_at: `${date}T11:00:00Z` }
}
const daysBefore = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
// A 10 km run every other day for `days` days before the Monday
const history = (days: number) => Array.from({ length: Math.floor(days / 2) }, (_, i) => run(daysBefore(MONDAY, 1 + i * 2)))

const goal = (extra: Partial<CoachGoal> = {}): CoachGoal => ({
  kind: 'progress', race_date: null, race_distance_m: null, race_gain_m: null, outings_per_week: 3, preferred_days: [], long_run_day: null, ...extra,
})

describe('weeks', () => {
  it('start on Monday', () => {
    expect(isoWeekday(DAY)).toBe(3)
    expect(isoWeekday('2026-11-15')).toBe(7)
    expect(weekStart(DAY)).toBe(MONDAY)
    expect(weekStart('2026-11-15')).toBe(MONDAY)
    expect(weekStart(MONDAY)).toBe(MONDAY)
  })
})

describe('weekVolume', () => {
  it('has no target while the usual week is unknown', () => {
    expect(weekVolume([], null, DAY)).toBeNull()
    expect(weekVolume([run(daysBefore(MONDAY, 2))], null, DAY)).toBeNull()
  })

  it('aims 10 % over the 4 weeks before Monday, 5 % when easing back in', () => {
    const outings = history(40)
    // A 10 km run every other day: 35 km a week
    const weekly = trainingForm(outings, new Date('2026-11-15T12:00:00Z')).baseline!
    expect(weekly).toBeCloseTo(35)
    expect(weekVolume(outings, goal(), DAY)!.target).toBeCloseTo(weekly * WEEK_GROWTH)
    expect(weekVolume(outings, goal({ kind: 'resume' }), DAY)!.target).toBeCloseTo(weekly * RESUME_WEEK_GROWTH)
    // The same all week, whatever is run meanwhile
    expect(weekVolume([...outings, run(MONDAY, 30)], goal(), '2026-11-15')!.target).toBeCloseTo(weekly * WEEK_GROWTH)
  })

  it('lightens every 4th week of the history', () => {
    // History starting 21 days before Monday: this is its 4th week
    const lighter = [run(daysBefore(MONDAY, 21)), ...history(20)]
    const week = weekVolume(lighter, goal(), DAY)!
    expect(week.lighter).toBe(true)
    expect(week.target).toBeCloseTo(trainingForm(lighter, new Date('2026-11-15T12:00:00Z')).baseline! * LIGHTER_WEEK)
    expect(weekVolume([run(daysBefore(MONDAY, 28)), ...history(26)], goal(), DAY)!.lighter).toBe(false)
    expect(weekVolume([run(daysBefore(MONDAY, 14)), ...history(12)], goal(), DAY)!.lighter).toBe(false)
  })

  it('keeps the target while learning, whatever the week’s own outings', () => {
    const learning = history(10)
    const target = weekVolume(learning, goal(), MONDAY)!.target
    expect(weekVolume([...learning, run(MONDAY, 40)], goal(), '2026-11-12')!.target).toBeCloseTo(target)
  })

  it('counts the week’s outings until the day, and those before it for the session', () => {
    const week = weekVolume([...history(40), run(MONDAY, 8), run('2026-11-10', 6), run(DAY, 5), run('2026-11-12', 50)], goal(), DAY)!
    expect(week).toMatchObject({ start: MONDAY, end: '2026-11-15', done: 19, doneBefore: 14 })
  })

  it('counts the outings left: the member’s days from the day on, else the outings a week less the days run', () => {
    const outings = [...history(40), run(MONDAY), run('2026-11-10')]
    expect(weekVolume(outings, goal({ preferred_days: [2, 4, 7] }), DAY)!.outingsLeft).toBe(2)
    expect(weekVolume(outings, goal({ preferred_days: [1, 2, 3] }), '2026-11-15')!.outingsLeft).toBe(1)
    expect(weekVolume(outings, goal(), DAY)!.outingsLeft).toBe(1)
    expect(weekVolume(outings, goal({ outings_per_week: 5 }), DAY)!.outingsLeft).toBe(3)
    expect(weekVolume(outings, null, DAY)!.outingsLeft).toBe(1)
  })
})

describe('weekSessionCap', () => {
  const week = { start: MONDAY, end: '2026-11-15', target: 30, done: 0, doneBefore: 12, lighter: false, tapering: false, outingsLeft: 3 }

  it('gives the session a bit more than its share of what is left, never more than what is left', () => {
    expect(weekSessionCap(week)).toBeCloseTo(9)
    expect(weekSessionCap({ ...week, outingsLeft: 1 })).toBe(18)
    expect(weekSessionCap({ ...week, doneBefore: 35 })).toBe(0)
  })
})

describe('the session of the day within the week', () => {
  const input = (extra: Partial<CoachInput> = {}): CoachInput => ({
    state: 'progress', ratio: 1.1, goal: null, minutes: 60, outingDays: 1, easyPace: 6, today: DAY, weekly: 100, longest: 30, ...extra,
  })

  it('is shortened to what the week leaves, and says so', () => {
    const choice = sessionOfTheDay(input({ weekCap: 6 }))
    expect(choice.plan).toMatchObject({ kind: 'endurance', minutes: 35 })
    expect(choice.capBy).toBe('week')
  })

  it('keeps 20 minutes once the week is done', () => {
    const choice = sessionOfTheDay(input({ weekCap: 0 }))
    expect(choice.plan.minutes).toBe(CAP_MIN_MINUTES)
    expect(choice.capBy).toBe('week')
  })

  it('leaves it to the recent outings when they cap it more', () => {
    expect(sessionOfTheDay(input({ weekly: 4, longest: 4, weekCap: 9 })).capBy).toBe('recent')
    expect(sessionOfTheDay(input({ weekCap: 50 })).cap).toBeNull()
  })
})
