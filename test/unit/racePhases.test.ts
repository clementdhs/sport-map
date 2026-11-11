import { describe, expect, it } from 'vitest'
import type { CoachGoal } from '#shared/types/account'
import { type CoachInput, sessionOfTheDay } from '#shared/utils/coachSessions'
import { weekVolume } from '#shared/utils/coachWeek'
import { phaseKeySessions, racePhase, TAPER_WEEK } from '#shared/utils/racePhases'
import { type LoadOuting, trainingForm } from '#shared/utils/trainingForm'

// Thursday 12 November 2026
const DAY = '2026-11-12'
const inDays = (n: number) => new Date(Date.parse(`${DAY}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const race = (days: number, km = 10, gain: number | null = null): CoachGoal => ({
  kind: 'race', race_date: inDays(days), race_distance_m: km * 1000, race_gain_m: gain, outings_per_week: 3, preferred_days: [], long_run_day: null,
})

describe('racePhase', () => {
  it('has none without a race ahead', () => {
    expect(racePhase(null, DAY)).toBeNull()
    expect(racePhase({ ...race(10), kind: 'progress' }, DAY)).toBeNull()
    expect(racePhase(race(0), DAY)).toBeNull()
    expect(racePhase(race(-3), DAY)).toBeNull()
  })

  it('tapers the last week before a short race, the last two before a long one', () => {
    expect(racePhase(race(3), DAY)).toMatchObject({ name: 'taper', daysLeft: 3, week: 1, weeks: 1 })
    expect(racePhase(race(10, 21.1), DAY)).toMatchObject({ name: 'taper', week: 1, weeks: 2 })
    expect(racePhase(race(3, 42.2), DAY)).toMatchObject({ name: 'taper', week: 2, weeks: 2 })
  })

  it('builds the 6 weeks before the taper', () => {
    expect(racePhase(race(10), DAY)).toMatchObject({ name: 'build', week: 6, weeks: 6 })
    expect(racePhase(race(49), DAY)).toMatchObject({ name: 'build', week: 1, weeks: 6 })
    expect(racePhase(race(56, 21.1), DAY)).toMatchObject({ name: 'build', week: 1, weeks: 6 })
  })

  it('lays the base before, open-ended, counting the weeks to the build', () => {
    expect(racePhase(race(60), DAY)).toMatchObject({ name: 'base', weeks: null, untilNext: 2 })
    expect(racePhase(race(50), DAY)).toMatchObject({ name: 'base', untilNext: 1 })
  })
})

describe('phaseKeySessions', () => {
  it('leaves intervals out of the base, never leaving none', () => {
    expect(phaseKeySessions(['longHills', 'intervals', 'shortHills'], racePhase(race(60), DAY), race(60))).toEqual(['longHills', 'shortHills'])
    expect(phaseKeySessions(['intervals'], racePhase(race(60), DAY), race(60))).toEqual(['shortHills'])
  })

  it('puts the race’s own sessions first while building: fast ones on the road, hills on a trail', () => {
    expect(phaseKeySessions(['longHills', 'intervals', 'shortHills'], racePhase(race(20), DAY), race(20))).toEqual(['intervals', 'longHills', 'shortHills'])
    const trail = race(20, 30, 1500)
    expect(phaseKeySessions(['shortHills', 'intervals', 'longHills'], racePhase(trail, DAY), trail)).toEqual(['shortHills', 'longHills', 'intervals'])
  })

  it('changes nothing without a race or while tapering', () => {
    const kinds = ['longHills', 'intervals'] as const
    expect(phaseKeySessions([...kinds], null, null)).toEqual(kinds)
    expect(phaseKeySessions([...kinds], racePhase(race(3), DAY), race(3))).toEqual(kinds)
  })
})

describe('the sessions and the week of a preparation', () => {
  const input = (goal: CoachGoal, extra: Partial<CoachInput> = {}): CoachInput => ({
    state: 'recovery', ratio: 0.5, goal, minutes: 60, outingDays: 0, easyPace: 6, today: DAY, weekly: 100, longest: 30, ...extra,
  })

  it('proposes no intervals in the base', () => {
    const goal = race(60)
    const kinds = [0, 1, 2, 3].map(other => sessionOfTheDay(input(goal), other).plan.kind)
    expect(kinds).not.toContain('intervals')
  })

  it('stops the long run towards the race once tapering', () => {
    expect(sessionOfTheDay(input(race(20, 21.1), { minutes: 120 })).reason).toBe('raceLong')
    expect(sessionOfTheDay(input(race(10, 21.1), { minutes: 120 })).reason).not.toBe('raceLong')
  })

  it('lowers the week’s target while tapering', () => {
    const outings: LoadOuting[] = Array.from({ length: 20 }, (_, i) => ({
      sport_type: 'running', distance_m: 10_000, elevation_gain_m: 0, completed_at: new Date(Date.parse('2026-11-08T11:00:00Z') - i * 2 * 86_400_000).toISOString(),
    }))
    const usual = trainingForm(outings, new Date('2026-11-15T12:00:00Z')).baseline!
    const week = weekVolume(outings, race(3), DAY)!
    expect(week).toMatchObject({ tapering: true, lighter: false })
    expect(week.target).toBeCloseTo(usual * TAPER_WEEK)
    expect(weekVolume(outings, race(30), DAY)!.tapering).toBe(false)
  })
})
