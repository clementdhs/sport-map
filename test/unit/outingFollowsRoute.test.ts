import { describe, expect, it } from 'vitest'
import type { LngLat } from '#shared/utils/routes'
import { outingFollowsRoute } from '#shared/utils/outings'

// About 111 m of latitude per 0.001°; at 45° N, 0.001° of longitude is about 79 m.
const LAT = 45
const metresEast = (m: number) => m / 78_710
const metresNorth = (m: number) => m / 111_132

// A straight track due east, `lengthM` long, one point every `stepM`, `offsetM` north of the route's line.
function eastward(lengthM: number, { stepM = 10, offsetM = 0, fromM = 0 } = {}): LngLat[] {
  const points: LngLat[] = []
  for (let m = fromM; m <= fromM + lengthM; m += stepM) points.push([6 + metresEast(m), LAT + metresNorth(offsetM)])
  return points
}

describe('outingFollowsRoute', () => {
  const route = eastward(5000, { stepM: 100 })

  it('accepts an outing recorded on the route, GPS jitter included', () => {
    const outing = eastward(5000).map(([lng, lat], i): LngLat => [lng, lat + metresNorth(i % 2 ? 15 : -15)])
    expect(outingFollowsRoute(outing, route)).toBe(true)
  })

  it('accepts the route done the other way round', () => {
    expect(outingFollowsRoute(eastward(5000).reverse(), route)).toBe(true)
  })

  it('accepts a short detour away from the route', () => {
    const outing = eastward(5000).map(([lng, lat], i): LngLat => i >= 100 && i < 150 ? [lng, lat + metresNorth(300)] : [lng, lat])
    expect(outingFollowsRoute(outing, route)).toBe(true)
  })

  it('refuses an outing recorded somewhere else', () => {
    expect(outingFollowsRoute(eastward(5000, { offsetM: 2000 }), route)).toBe(false)
  })

  it('refuses an outing that runs on for long past the route', () => {
    expect(outingFollowsRoute(eastward(10_000), route)).toBe(false)
  })

  it('refuses an outing that only covers part of the route', () => {
    expect(outingFollowsRoute(eastward(2000), route)).toBe(false)
  })

  it('refuses an outing alongside the route, more than 50 m away', () => {
    expect(outingFollowsRoute(eastward(5000, { offsetM: 80 }), route)).toBe(false)
  })

  it('refuses tracks too short to compare', () => {
    expect(outingFollowsRoute([[6, LAT]], route)).toBe(false)
    expect(outingFollowsRoute(eastward(5000), [[6, LAT]])).toBe(false)
  })
})
