import { describe, expect, it } from 'vitest'
import type { StatsOuting } from '#shared/types/routes'
import { estimateGapMin, outingEnd, statsOutings } from '#shared/utils/outings'

const outing = (routeId: string, completedAt: string, movingS: number | null): StatsOuting => ({
  route_id: routeId,
  sport_type: 'hiking',
  distance_m: 10_000,
  elevation_gain_m: 500,
  completed_at: completedAt,
  moving_s: movingS,
})

describe('outingEnd', () => {
  it('adds the elapsed time to the start', () => {
    expect(outingEnd('2026-09-28T08:00:00.000Z', 5400)).toBe('2026-09-28T09:30:00.000Z')
  })
})

describe('statsOutings', () => {
  it('counts every recorded outing, and once the routes only marked as done, latest first', () => {
    const recorded = [outing('a', '2026-09-20T10:00:00Z', 3600), outing('a', '2026-09-27T10:00:00Z', 3400)]
    const markedDone = [outing('a', '2026-09-27T10:00:00Z', null), outing('b', '2026-09-25T10:00:00Z', null)]
    expect(statsOutings(recorded, markedDone).map(o => [o.route_id, o.completed_at, o.moving_s])).toEqual([
      ['a', '2026-09-27T10:00:00Z', 3400],
      ['b', '2026-09-25T10:00:00Z', null],
      ['a', '2026-09-20T10:00:00Z', 3600],
    ])
  })
})

describe('estimateGapMin', () => {
  it('rounds the gap to 5 minutes, negative when faster', () => {
    expect(estimateGapMin(100 * 60, 120)).toBe(-20)
    expect(estimateGapMin(133 * 60, 120)).toBe(15)
  })

  it('is 0 when as estimated', () => {
    expect(estimateGapMin(118 * 60, 120)).toBe(0)
    expect(estimateGapMin(122 * 60, 120)).toBe(0)
  })
})
