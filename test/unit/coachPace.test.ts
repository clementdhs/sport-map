import { describe, expect, it } from 'vitest'
import { coachPace, EASY_PACE_FACTOR, outingsEasyPace, type PaceOuting } from '#shared/utils/coachPace'
import { DEFAULT_PACES } from '#shared/utils/routes'

const NOW = new Date('2026-11-11T10:00:00Z')

// A run `ago` days before NOW: `km` at `pace` min/km of moving time, on a route with `gain` m.
function run(ago: number, km: number, pace: number, gain = 0, extra: Partial<PaceOuting> = {}): PaceOuting {
  return {
    sport_type: 'running',
    distance_m: km * 1000,
    elevation_gain_m: gain,
    completed_at: new Date(NOW.getTime() - ago * 86_400_000).toISOString(),
    moving_s: Math.round(km * pace * 60),
    ...extra,
  }
}

describe('outingsEasyPace', () => {
  it('slows down the median pace of the latest runs', () => {
    const pace = outingsEasyPace([run(1, 10, 5.5), run(3, 10, 6), run(5, 10, 6.5)], NOW)
    expect(pace).toBeCloseTo(6 * EASY_PACE_FACTOR, 2)
  })

  it('counts the gain in km-effort, so a hilly run compares with a flat one', () => {
    // 6.4 km with 60 m of gain in 40 min 12 s: 7 km-effort, 5:45 /km-effort
    const hilly = run(1, 6.4, 0, 60, { moving_s: 2412 })
    expect(outingsEasyPace([hilly, hilly], NOW)).toBeCloseTo((2412 / 60 / 7) * EASY_PACE_FACTOR, 2)
  })

  it("takes the route's gain in proportion when the outing stopped on the way", () => {
    // 8 of a 20 km route with 800 m: 8 km + 320 m = 11.2 km-effort in 67.2 min
    const outing = run(1, 20, 0, 800, { covered_m: 8000, moving_s: 4032 })
    expect(outingsEasyPace([outing, outing], NOW)).toBeCloseTo(6 * EASY_PACE_FACTOR, 2)
  })

  it('takes the GPS distance when there is one', () => {
    const outing = run(1, 10, 6, 0, { covered_m: 12_000 })
    expect(outingsEasyPace([outing, outing], NOW)).toBeCloseTo(5 * EASY_PACE_FACTOR, 2)
  })

  it('only looks at recent runs recorded with the GPS, long enough and of a believable pace', () => {
    const left = [
      run(1, 10, 6, 0, { sport_type: 'hiking' }),
      run(1, 10, 6, 0, { sport_type: 'cycling' }),
      run(2, 10, 6, 0, { moving_s: null }),
      run(3, 1.5, 6),
      run(4, 10, 20),
      run(70, 10, 6),
    ]
    expect(outingsEasyPace([...left, run(5, 10, 6)], NOW)).toBeNull()
    expect(outingsEasyPace([...left, run(5, 10, 6), run(6, 10, 6, 0, { sport_type: 'trail' })], NOW)).toBeCloseTo(6 * EASY_PACE_FACTOR, 2)
  })

  it('keeps the 5 latest runs', () => {
    const latest = [1, 2, 3, 4, 5].map(ago => run(ago, 10, 6))
    const older = [6, 7, 8, 9, 10, 11].map(ago => run(ago, 10, 4))
    expect(outingsEasyPace([...older, ...latest], NOW)).toBeCloseTo(6 * EASY_PACE_FACTOR, 2)
  })
})

describe('coachPace', () => {
  const runs = [run(1, 10, 6), run(2, 10, 6)]

  it('takes the member\'s setting first', () => {
    expect(coachPace(runs, 5.5, NOW)).toEqual({ pace: 5.5, source: 'settings' })
  })

  it('then their runs, then the default pace', () => {
    expect(coachPace(runs, null, NOW).source).toBe('outings')
    expect(coachPace([], undefined, NOW)).toEqual({ pace: DEFAULT_PACES.running, source: 'default' })
  })
})
