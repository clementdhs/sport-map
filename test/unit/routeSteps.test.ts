import { describe, expect, it } from 'vitest'
import type { LngLat } from '#shared/utils/routes'
import { gainAlong, routeSteps } from '~/utils/routeSteps'

// Due east along the equator: 0.01° ≈ 1112 m per step.
const track: LngLat[] = [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]]

describe('gainAlong', () => {
  it('scales the raw climbing so it ends on the stored gain', () => {
    // Raw climbing 100 + 50 = 150 m, stored (smoothed) gain 120 m.
    expect(gainAlong([0, 1, 2, 3], [100, 200, 180, 230], 120)).toEqual([0, 80, 80, 120])
  })

  it('spreads the gain along the distance without elevations', () => {
    expect(gainAlong([0, 500, 1000], null, 100)).toEqual([0, 50, 100])
  })

  it('has no gain when the route has none', () => {
    expect(gainAlong([0, 500], [10, 20], null)).toEqual([null, null])
  })
})

describe('routeSteps', () => {
  it('orders the points along the track with their distance and gain', () => {
    const steps = routeSteps(track, [0, 100, 100, 100], 100, [
      { coordinates: [0.025, 0.001] as LngLat, name: 'b' },
      { coordinates: [0.005, -0.001] as LngLat, name: 'a' },
    ])
    expect(steps.map(step => step.name)).toEqual(['a', 'b'])
    expect(steps[0]!.distanceM).toBeCloseTo(556, -1)
    expect(steps[0]!.gainM).toBeCloseTo(50, 0)
    expect(steps[1]!.distanceM).toBeCloseTo(2780, -1)
    expect(steps[1]!.gainM).toBeCloseTo(100, 0)
  })

  it('has no steps without a track', () => {
    expect(routeSteps([[0, 0]], null, null, [{ coordinates: [0, 0] as LngLat }])).toEqual([])
  })
})
