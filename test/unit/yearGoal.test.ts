import { describe, expect, it } from 'vitest'
import type { StatsOuting } from '#shared/types/routes'
import { GOAL_TRAIL_END, goalProgress, goalTrailPath, goalTrailX, goalTrailY, parseYearGoal, type YearGoal } from '~/utils/yearGoal'

const outing = (completed_at: string, distance_m: number, sport_type: StatsOuting['sport_type'] = 'running', elevation_gain_m: number | null = 100): StatsOuting =>
  ({ route_id: completed_at, completed_at, distance_m, elevation_gain_m, moving_s: null, sport_type }) as StatsOuting

describe('parseYearGoal', () => {
  it('keeps a valid goal', () => {
    expect(parseYearGoal({ metric: 'distance', target: 1000, sport: null })).toEqual({ metric: 'distance', target: 1000, sport: null })
    expect(parseYearGoal({ metric: 'gain', target: 15000, sport: 'trail' })).toEqual({ metric: 'gain', target: 15000, sport: 'trail' })
  })

  it('rounds a number of outings and drops an unknown sport', () => {
    expect(parseYearGoal({ metric: 'outings', target: 49.6, sport: 'swimming' })).toEqual({ metric: 'outings', target: 50, sport: null })
  })

  it('falls back to none for nothing or a damaged goal', () => {
    expect(parseYearGoal(undefined)).toBeNull()
    expect(parseYearGoal(null)).toBeNull()
    expect(parseYearGoal('1000')).toBeNull()
    expect(parseYearGoal({ metric: 'speed', target: 10 })).toBeNull()
    expect(parseYearGoal({ metric: 'distance', target: '1000' })).toBeNull()
    expect(parseYearGoal({ metric: 'distance', target: 0 })).toBeNull()
    expect(parseYearGoal({ metric: 'distance', target: Number.NaN })).toBeNull()
    expect(parseYearGoal({ metric: 'distance', target: 1e9 })).toBeNull()
  })
})

describe('goalProgress', () => {
  const goal: YearGoal = { metric: 'distance', target: 365, sport: null }

  it('compares this year\'s outings with the steady pace up to the end of today', () => {
    // 10 February 2026: 41 days elapsed out of 365.
    const progress = goalProgress(goal, [outing('2026-01-05T08:00:00Z', 20_000), outing('2026-02-01T08:00:00Z', 30_000)], new Date('2026-02-10T12:00:00Z'))
    expect(progress).toMatchObject({ year: 2026, done: 50, target: 365, expected: 41, gap: 9, reached: false })
    expect(progress.perWeek).toBeCloseTo((315 * 7) / 324)
  })

  it('leaves out other years and other sports', () => {
    const outings = [
      outing('2025-12-31T23:30:00Z', 10_000), // 1 January 2026 in France
      outing('2025-12-31T12:00:00Z', 50_000),
      outing('2026-03-01T08:00:00Z', 40_000, 'cycling'),
    ]
    expect(goalProgress(goal, outings, new Date('2026-03-02T12:00:00Z')).done).toBe(50)
    expect(goalProgress({ ...goal, sport: 'running' }, outings, new Date('2026-03-02T12:00:00Z')).done).toBe(10)
  })

  it('counts the gain or the outings', () => {
    const outings = [outing('2026-04-01T08:00:00Z', 10_000, 'hiking', 800), outing('2026-04-02T08:00:00Z', 5000, 'hiking', null)]
    const now = new Date('2026-04-03T12:00:00Z')
    expect(goalProgress({ metric: 'gain', target: 10_000, sport: null }, outings, now).done).toBe(800)
    expect(goalProgress({ metric: 'outings', target: 50, sport: null }, outings, now).done).toBe(2)
  })

  it('expects the whole goal on 31 December, with a leap year', () => {
    const progress = goalProgress({ metric: 'outings', target: 100, sport: null }, [], new Date('2028-12-31T12:00:00Z'))
    expect(progress.expected).toBe(100)
    expect(progress.perWeek).toBe(700)
    expect(goalProgress({ metric: 'outings', target: 366, sport: null }, [], new Date('2028-03-01T12:00:00Z')).expected).toBe(61)
  })

  it('needs nothing more once reached', () => {
    const progress = goalProgress({ metric: 'outings', target: 1, sport: null }, [outing('2026-01-02T08:00:00Z', 1000)], new Date('2026-01-03T12:00:00Z'))
    expect(progress).toMatchObject({ reached: true, perWeek: 0 })
  })
})

describe('goal trail', () => {
  const points = (path: string) => [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])])

  it('splits the trail at the progress, both parts meeting at the dot', () => {
    const done = points(goalTrailPath(0, 0.4))
    const rest = points(goalTrailPath(0.4, 1))
    expect(done[0]![0]).toBe(goalTrailX(0))
    expect(done.at(-1)).toEqual(rest[0])
    expect(rest.at(-1)![0]).toBe(GOAL_TRAIL_END)
    expect(done.at(-1)![1]).toBeCloseTo(goalTrailY(goalTrailX(0.4)), 0)
    // Left to right, inside the box
    for (const [x, y] of [...done, ...rest]) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThan(20)
      expect(y).toBeLessThan(60)
    }
  })

  it('draws nothing for an empty part and clamps beyond the goal', () => {
    expect(goalTrailPath(0, 0)).toBe('')
    expect(goalTrailPath(1, 1.5)).toBe('')
    expect(goalTrailX(2)).toBe(GOAL_TRAIL_END)
  })
})
