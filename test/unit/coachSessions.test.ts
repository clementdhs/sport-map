import { describe, expect, it } from 'vitest'
import type { CoachGoal } from '#shared/types/account'
import { coachGoalRow, coachGoalSchema, daysUntil, parseCoachGoal, weekdayName } from '#shared/utils/coachGoal'
import {
  buildSession,
  type CoachInput,
  KEY_SESSIONS,
  OVERLOAD_MAX_MINUTES,
  outingDaysBefore,
  raceLongRunKm,
  SESSION_DURATIONS,
  CAP_MIN_MINUTES,
  UNKNOWN_CAP_MINUTES,
  sessionCap,
  sessionLoad,
  sessionOfTheDay,
  TAPER_MAX_MINUTES,
} from '#shared/utils/coachSessions'
import type { LoadOuting } from '#shared/utils/trainingForm'

const TODAY = '2026-11-09'
const NOW = new Date('2026-11-09T10:00:00Z')

function input(extra: Partial<CoachInput> = {}): CoachInput {
  return { state: 'progress', ratio: 1.1, goal: null, minutes: 60, outingDays: 10, easyPace: 6, today: TODAY, weekly: 100, longest: 30, ...extra }
}

const race = (date: string, km = 30, gain: number | null = null): CoachGoal => ({
  kind: 'race',
  race_date: date,
  race_distance_m: km * 1000,
  race_gain_m: gain,
})

// Every session "Autre séance" walks through.
function allOptions(value: CoachInput) {
  const first = sessionOfTheDay(value)
  return Array.from({ length: first.options }, (_, i) => sessionOfTheDay(value, i))
}

describe('buildSession', () => {
  it('fills the time available, at the easy pace for an endurance run', () => {
    const plan = buildSession('endurance', 60, 6)
    expect(plan.minutes).toBe(60)
    expect(plan.blocks).toHaveLength(1)
    // 10 km-effort on nearly flat terrain (5 m/km)
    expect(plan.distanceM).toBe(9500)
    expect(plan.gainM).toBe(50)
  })

  it.each(['shortHills', 'longHills', 'intervals'] as const)('fits the repeats of %s between warm-up and cool-down', (kind) => {
    for (const minutes of [30, 45, 60, 90]) {
      const plan = buildSession(kind, minutes, 6)
      const total = plan.blocks.reduce((sum, block) => sum + block.minutes, 0)
      expect(total).toBe(minutes)
      expect(plan.blocks[0]!.kind).toBe('warmup')
      expect(plan.blocks.at(-1)!.kind).toBe('cooldown')
      expect(plan.blocks.filter(block => block.kind === 'effort')).toHaveLength(plan.reps!.count)
      expect(plan.reps!.count).toBeGreaterThanOrEqual(2)
    }
  })

  it('climbs in hill repeats and stays flat in intervals', () => {
    const hills = buildSession('shortHills', 45, 6)
    expect(hills.reps).toEqual({ count: 10, effortMin: 1, recoveryMin: 2, hill: true })
    expect(hills.gainM).toBeGreaterThan(80)
    const intervals = buildSession('intervals', 45, 6)
    expect(intervals.reps).toEqual({ count: 6, effortMin: 3, recoveryMin: 2, hill: false })
    // Faster during the efforts: more distance than an endurance run of the same time
    expect(intervals.distanceM).toBeGreaterThan(buildSession('endurance', 45, 6).distanceM - 1000)
  })

  it('makes the hilly long run climb more than the flat one', () => {
    const hilly = buildSession('longHilly', 90, 6)
    const flat = buildSession('long', 90, 6)
    expect(hilly.gainM).toBeGreaterThan(200)
    expect(hilly.distanceM).toBeLessThan(flat.distanceM)
    expect(hilly.blocks.map(block => block.kind)).toEqual(['easy', 'hilly', 'easy', 'hilly', 'easy', 'hilly', 'easy'])
  })

  it('goes faster with a faster pace', () => {
    expect(buildSession('endurance', 60, 5).distanceM).toBeGreaterThan(buildSession('endurance', 60, 6).distanceM)
  })

  it('has nothing to run on a rest day', () => {
    expect(buildSession('rest', 60, 6)).toMatchObject({ minutes: 0, blocks: [], distanceM: 0, gainM: 0 })
  })
})

describe('sessionOfTheDay', () => {
  it('only proposes an easy run while the coach is learning', () => {
    for (const minutes of SESSION_DURATIONS) {
      const choice = sessionOfTheDay(input({ state: 'learning', ratio: null, minutes }))
      expect(choice).toMatchObject({ reason: 'learning', options: 1 })
      expect(choice.plan).toMatchObject({ kind: 'endurance', minutes })
    }
  })

  it('proposes a short jog when overloaded, rest far above the baseline', () => {
    for (const minutes of SESSION_DURATIONS) {
      const jog = sessionOfTheDay(input({ state: 'overload', ratio: 1.7, minutes }))
      expect(jog.reason).toBe('overloadJog')
      expect(jog.plan).toMatchObject({ kind: 'recovery', minutes: Math.min(minutes, OVERLOAD_MAX_MINUTES) })
      expect(sessionOfTheDay(input({ state: 'overload', ratio: 2.3, minutes })).plan.kind).toBe('rest')
    }
  })

  it('allows a key session in recovery, whatever the last outings', () => {
    for (const minutes of SESSION_DURATIONS) {
      for (const outingDays of [3, 4]) {
        const choice = sessionOfTheDay(input({ state: 'recovery', ratio: 0.6, minutes, outingDays }))
        expect(choice.reason).toBe('recovery')
        expect(KEY_SESSIONS).toContain(choice.plan.kind)
        expect(choice.plan.minutes).toBe(minutes)
      }
    }
  })

  it('alternates key sessions and endurance while progressing', () => {
    for (const minutes of SESSION_DURATIONS) {
      const key = sessionOfTheDay(input({ minutes, outingDays: 6 }))
      expect(key.reason).toBe('progressKey')
      expect(KEY_SESSIONS).toContain(key.plan.kind)
      // One more outing day: endurance, never a second key session in a row
      const easy = sessionOfTheDay(input({ minutes, outingDays: 7 }))
      expect(easy).toMatchObject({ reason: 'progressEasy', options: 1 })
      expect(easy.plan.kind).toBe('endurance')
    }
  })

  it('fits the key sessions to the time available', () => {
    const kinds = (minutes: CoachInput['minutes']) => allOptions(input({ minutes, outingDays: 2 })).map(choice => choice.plan.kind).sort()
    expect(kinds(30)).toEqual(['intervals', 'shortHills'])
    expect(kinds(45)).toEqual(['intervals', 'longHills', 'shortHills'])
    expect(kinds(60)).toEqual(['intervals', 'longHills', 'shortHills'])
    expect(kinds(90)).toEqual(['long', 'longHills', 'longHilly'])
    expect(kinds(120)).toEqual(['long', 'longHilly'])
  })

  it('keeps the same session all day and moves on the next day', () => {
    const value = input({ minutes: 45, outingDays: 2 })
    expect(sessionOfTheDay(value).plan).toEqual(sessionOfTheDay({ ...value }).plan)
    expect(sessionOfTheDay({ ...value, today: '2026-11-11' }).plan.kind).not.toBe(sessionOfTheDay(value).plan.kind)
    // "Autre séance" walks through the others, then back to the first
    expect(sessionOfTheDay(value, 3).plan).toEqual(sessionOfTheDay(value).plan)
  })

  it('changes with the duration', () => {
    const kinds = SESSION_DURATIONS.map(minutes => sessionOfTheDay(input({ minutes, outingDays: 2 })).plan)
    expect(new Set(kinds.map(plan => plan.distanceM)).size).toBe(SESSION_DURATIONS.length)
  })

  it('keeps to easy sessions when easing back in', () => {
    for (const minutes of SESSION_DURATIONS) {
      for (const state of ['recovery', 'progress'] as const) {
        const choices = allOptions(input({ state, minutes, outingDays: 2, goal: { kind: 'resume', race_date: null, race_distance_m: null, race_gain_m: null } }))
        for (const choice of choices) {
          expect(choice.reason).toBe('resume')
          expect(['endurance', 'long']).toContain(choice.plan.kind)
        }
      }
    }
  })

  describe('getting ready for a race', () => {
    it('lightens the last week, from J−7', () => {
      for (const date of ['2026-11-16', '2026-11-12', '2026-11-10']) {
        for (const minutes of SESSION_DURATIONS) {
          for (const state of ['recovery', 'progress', 'overload'] as const) {
            const choice = sessionOfTheDay(input({ state, ratio: state === 'overload' ? 2.5 : 1, minutes, goal: race(date) }))
            expect(choice).toMatchObject({ reason: 'taper', raceDays: daysUntil(date, TODAY), options: 1 })
            expect(choice.plan).toMatchObject({ kind: 'endurance', minutes: Math.min(minutes, TAPER_MAX_MINUTES) })
          }
        }
      }
    })

    it('rests on race day', () => {
      expect(sessionOfTheDay(input({ goal: race(TODAY) }))).toMatchObject({ reason: 'raceDay', raceDays: 0, plan: { kind: 'raceDay' } })
    })

    it('comes before the learning rule', () => {
      const learning = { state: 'learning', ratio: null, minutes: 120 } as const
      expect(sessionOfTheDay(input({ ...learning, goal: race(TODAY) })).reason).toBe('raceDay')
      expect(sessionOfTheDay(input({ ...learning, goal: race('2026-11-10') })).plan).toMatchObject({ kind: 'endurance', minutes: TAPER_MAX_MINUTES })
      expect(sessionOfTheDay(input({ ...learning, goal: race('2026-12-21') })).reason).toBe('learning')
    })

    it('runs the long run that grows towards the distance, with time for it', () => {
      const goal = race('2026-12-21', 30) // 6 weeks ahead
      const choice = sessionOfTheDay(input({ minutes: 120, goal, outingDays: 2 }))
      expect(choice).toMatchObject({ reason: 'raceLong', raceDays: 42, options: 1, plan: { kind: 'long' } })
      // 60 % of 30 km, nearly flat, at 6 min/km: 1 h 55
      expect(choice.plan.minutes).toBe(115)
      // Closer to the race, longer: capped by the time available
      expect(sessionOfTheDay(input({ minutes: 120, goal: race('2026-11-25', 30), outingDays: 2 })).plan.minutes).toBe(120)
      // Hilly for a trail race
      const trail = sessionOfTheDay(input({ minutes: 90, goal: race('2026-12-06', 30, 1200), outingDays: 2 }))
      expect(trail.plan.kind).toBe('longHilly')
      expect(trail.plan.gainM).toBeGreaterThan(350)
    })

    it('keeps the other key sessions with less time, and endurance one day out of two', () => {
      const goal = race('2026-12-21')
      const key = sessionOfTheDay(input({ minutes: 45, goal, outingDays: 2 }))
      expect(key).toMatchObject({ reason: 'progressKey', raceDays: 42 })
      expect(sessionOfTheDay(input({ minutes: 120, goal, outingDays: 3 })).plan.kind).toBe('endurance')
    })

    it('still heeds overload before the last week', () => {
      expect(sessionOfTheDay(input({ state: 'overload', ratio: 1.6, goal: race('2026-12-21') })).reason).toBe('overloadJog')
    })

    it('forgets a past race', () => {
      expect(sessionOfTheDay(input({ goal: race('2026-11-01'), outingDays: 2 })).reason).toBe('progressKey')
    })
  })
})

describe('cap from the usual week (#281)', () => {
  // A member easing back in: about 5 km-effort a week, a 6.4 km outing with 60 m of gain recently
  const small = { weekly: 5, longest: 7 }

  it('keeps to half an hour while the outings say nothing (new member, back from a long break)', () => {
    const unknown = { weekly: null, longest: 0 }
    expect(sessionCap(input(unknown))).toBe(UNKNOWN_CAP_MINUTES / 6)
    const choice = sessionOfTheDay(input({ state: 'learning', ratio: null, minutes: 120, ...unknown }))
    expect(choice.plan).toMatchObject({ kind: 'endurance', minutes: UNKNOWN_CAP_MINUTES })
    expect(choice.cap).toBe(5)
  })

  it('leaves a recovery jog as long as its slower pace allows', () => {
    // Cap 4 km-effort: 26.4 min at 6.6 min/km
    const { plan } = sessionOfTheDay(input({ state: 'overload', ratio: 1.6, weekly: 8, longest: 2 }))
    expect(plan).toMatchObject({ kind: 'recovery', minutes: 25 })
  })

  it('is the larger of half the week and the longest recent outing plus 10 %, less when easing back in', () => {
    expect(sessionCap(input({ weekly: 30, longest: 8 }))).toBe(15)
    expect(sessionCap(input({ weekly: 10, longest: 8 }))).toBeCloseTo(8.8)
    expect(sessionCap(input({ ...small, goal: { kind: 'resume', race_date: null, race_distance_m: null, race_gain_m: null } }))).toBe(7)
  })

  it('never goes under 20 minutes of easy run', () => {
    expect(sessionCap(input({ weekly: 1, longest: 0 }))).toBeCloseTo(CAP_MIN_MINUTES / 6)
    expect(sessionCap(input({ weekly: null, longest: 1 }))).toBeCloseTo(CAP_MIN_MINUTES / 6)
    const { plan } = sessionOfTheDay(input({ state: 'learning', ratio: null, weekly: 1, longest: 0 }))
    expect(plan).toMatchObject({ kind: 'endurance', minutes: CAP_MIN_MINUTES })
  })

  it('shortens an endurance run to the cap, by 5 minutes', () => {
    const resume: CoachGoal = { kind: 'resume', race_date: null, race_distance_m: null, race_gain_m: null }
    const choice = sessionOfTheDay(input({ state: 'recovery', ratio: 0, goal: resume, ...small }))
    // 7 km-effort at 6 min/km: 42 min
    expect(choice.plan).toMatchObject({ kind: 'endurance', minutes: 40 })
    expect(choice.cap).toBe(7)
    expect(sessionLoad(choice.plan)).toBeLessThanOrEqual(7)
  })

  it('leaves a session under the cap as it is', () => {
    const choice = sessionOfTheDay(input({ weekly: 60, longest: 15 }))
    expect(choice.cap).toBeNull()
    expect(choice.plan.minutes).toBe(60)
  })

  it('shortens key sessions, then turns them into endurance, and walks only through different ones', () => {
    for (const other of [0, 1, 2]) {
      const choice = sessionOfTheDay(input({ state: 'recovery', ratio: 0, ...small }), other)
      expect(sessionLoad(choice.plan)).toBeLessThanOrEqual(sessionCap(input(small))! + 0.05)
    }
    const kinds = new Set([0, 1, 2].map(other => sessionOfTheDay(input({ state: 'recovery', ratio: 0, weekly: 1, longest: 2 }), other).plan.kind))
    expect([...kinds]).toEqual(['endurance'])
    expect(sessionOfTheDay(input({ state: 'recovery', ratio: 0, weekly: 1, longest: 2 })).options).toBe(1)
  })

  it('turns a long run too short for one into endurance', () => {
    const { plan } = sessionOfTheDay(input({ state: 'recovery', ratio: 0, minutes: 120, weekly: 10, longest: 8 }))
    expect(plan.kind).toBe('endurance')
    expect(plan.minutes).toBeLessThan(60)
  })
})

describe('raceLongRunKm', () => {
  it('grows from half the distance to all of it two weeks before', () => {
    expect(raceLongRunKm(20_000, 70)).toBe(10)
    expect(raceLongRunKm(20_000, 35)).toBeCloseTo(14)
    expect(raceLongRunKm(20_000, 14)).toBe(20)
    expect(raceLongRunKm(20_000, 10)).toBe(20)
  })
})

describe('outingDaysBefore', () => {
  const outing = (ago: number, extra: Partial<LoadOuting> = {}): LoadOuting => ({
    sport_type: 'running',
    distance_m: 10_000,
    elevation_gain_m: 0,
    completed_at: new Date(Date.parse('2026-11-09T11:00:00Z') - ago * 86_400_000).toISOString(),
    ...extra,
  })

  it('counts the days with an outing before today, inside the history', () => {
    const outings = [outing(0), outing(1), outing(1), outing(3), outing(25), outing(40), outing(2, { sport_type: 'cycling' })]
    expect(outingDaysBefore(outings, 30, NOW)).toBe(3)
    // Today's outing changes nothing
    expect(outingDaysBefore(outings.slice(1), 30, NOW)).toBe(3)
  })
})

describe('coach goal', () => {
  it('accepts the three goals, the race with its date and distance', () => {
    expect(coachGoalSchema.safeParse({ kind: 'progress' }).success).toBe(true)
    expect(coachGoalSchema.safeParse({ kind: 'race', race_date: '2099-01-01', race_distance_m: 30_000 }).success).toBe(false)
    const date = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const parsed = coachGoalSchema.safeParse({ kind: 'race', race_date: date, race_distance_m: 30_000, race_gain_m: 1200 })
    expect(parsed.success).toBe(true)
    expect(coachGoalRow(parsed.data!)).toEqual({
      kind: 'race', race_date: date, race_distance_m: 30_000, race_gain_m: 1200, outings_per_week: 3, preferred_days: [], long_run_day: null,
    })
  })

  it('refuses a race in the past or without its distance', () => {
    expect(coachGoalSchema.safeParse({ kind: 'race', race_date: '2020-01-01', race_distance_m: 30_000 }).success).toBe(false)
    const date = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    expect(coachGoalSchema.safeParse({ kind: 'race', race_date: date }).success).toBe(false)
    expect(coachGoalSchema.safeParse({ kind: 'race', race_date: date, race_distance_m: 400 }).success).toBe(false)
  })

  it('clears the race fields of the other goals', () => {
    expect(coachGoalRow(coachGoalSchema.parse({ kind: 'resume' }))).toEqual({
      kind: 'resume', race_date: null, race_distance_m: null, race_gain_m: null, outings_per_week: 3, preferred_days: [], long_run_day: null,
    })
  })

  describe('the member’s week (#283)', () => {
    const goal = (week: object) => coachGoalSchema.safeParse({ kind: 'progress', ...week })
    const issue = (week: object) => goal(week).error?.issues[0]?.message

    it('takes 2 to 6 outings a week, 3 by default', () => {
      expect(goal({}).data?.outings_per_week).toBe(3)
      expect(goal({ outings_per_week: 6 }).success).toBe(true)
      expect(issue({ outings_per_week: 1 })).toBe('validation.outingsPerWeekRange')
      expect(issue({ outings_per_week: 7 })).toBe('validation.outingsPerWeekRange')
    })

    it('takes no days or as many as outings', () => {
      expect(goal({ outings_per_week: 3, preferred_days: [2, 4, 7] }).success).toBe(true)
      expect(issue({ outings_per_week: 3, preferred_days: [2, 4] })).toBe('validation.preferredDaysCount')
      expect(issue({ outings_per_week: 2, preferred_days: [2, 2] })).toBe('validation.preferredDaysCount')
      expect(goal({ outings_per_week: 2, preferred_days: [0, 8] }).success).toBe(false)
    })

    it('puts the long run on one of the days, any day without them', () => {
      expect(goal({ outings_per_week: 3, preferred_days: [2, 4, 7], long_run_day: 7 }).success).toBe(true)
      expect(issue({ outings_per_week: 3, preferred_days: [2, 4, 7], long_run_day: 6 })).toBe('validation.longRunDay')
      expect(goal({ long_run_day: 6 }).success).toBe(true)
    })

    it('saves the days sorted', () => {
      const parsed = coachGoalSchema.parse({ kind: 'progress', outings_per_week: 3, preferred_days: [7, 2, 4], long_run_day: 7 })
      expect(coachGoalRow(parsed)).toMatchObject({ outings_per_week: 3, preferred_days: [2, 4, 7], long_run_day: 7 })
    })

    it('names the days in the language', () => {
      expect(weekdayName(1, 'fr-FR')).toBe('lun.')
      expect(weekdayName(7, 'en-GB')).toBe('Sun')
    })
  })

  it('ignores a goal the app does not know', () => {
    expect(parseCoachGoal({ kind: 'marathon' as 'race', race_date: null, race_distance_m: null, race_gain_m: null })).toBeNull()
    expect(parseCoachGoal(null)).toBeNull()
  })
})
