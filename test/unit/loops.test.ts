import { describe, expect, it } from 'vitest'
import { distance } from '@turf/turf'
import {
  climbOf, isOnTarget, isShortestThrough, isViaInReach, LOOP_TOLERANCES, type LoopClimb, loopCorner, loopLengthForDuration, loopRoutePoints,
  loopViaPlaces, loopViaQuery, loopWaypointIndices, nextLoopLength, outAndBack, pickLoopVia, rankByClimb, rankByGain,
  seedBearing, typicalGainPerKm, viaSearchRadius,
} from '#shared/utils/loops'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import { type LngLat, type LngLatEle, trackDistances, type WayInfo } from '#shared/utils/routes'

// A square loop from Annecy, a point every 100 m, sides of `sideM` meters.
function squareLoop(sideM: number): LngLat[] {
  const lat0 = 45.9
  const dLat = 100 / 111_320
  const dLng = dLat / Math.cos(lat0 * Math.PI / 180)
  const steps = sideM / 100
  const points: LngLat[] = []
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const
  let [x, y] = [0, 0]
  points.push([6.12, lat0])
  for (const [dx, dy] of directions) {
    for (let i = 0; i < steps; i++) {
      x += dx
      y += dy
      points.push([6.12 + x * dLng, lat0 + y * dLat])
    }
  }
  return points
}

describe('isOnTarget', () => {
  it('accepts loops within 10 % of the target', () => {
    expect(isOnTarget(10_000, 10_000)).toBe(true)
    expect(isOnTarget(9_000, 10_000)).toBe(true)
    expect(isOnTarget(11_000, 10_000)).toBe(true)
    expect(isOnTarget(8_990, 10_000)).toBe(false)
    expect(isOnTarget(11_010, 10_000)).toBe(false)
  })
})

describe('nextLoopLength', () => {
  it('asks for the target first', () => {
    expect(nextLoopLength(10_000, [])).toBe(10_000)
  })

  it('then scales the last request by how far off its loop was', () => {
    expect(nextLoopLength(10_000, [{ requestedM: 10_000, lengthM: 12_500 }])).toBe(8000)
    expect(nextLoopLength(10_000, [{ requestedM: 10_000, lengthM: 8000 }])).toBe(12_500)
  })

  it('then follows the line through the last two tries', () => {
    // Loops grow by 2 m per meter asked for: 10 000 m needs 7 000 m.
    const tries = [{ requestedM: 10_000, lengthM: 16_000 }, { requestedM: 6_250, lengthM: 8_500 }]
    expect(nextLoopLength(10_000, tries)).toBe(7000)
  })

  it('falls back on scaling when a longer request gave a shorter loop', () => {
    const tries = [{ requestedM: 10_000, lengthM: 12_000 }, { requestedM: 8_000, lengthM: 12_500 }]
    expect(nextLoopLength(10_000, tries)).toBe(6400)
  })

  it('stays between a quarter and twice the target, and within the API limits', () => {
    expect(nextLoopLength(10_000, [{ requestedM: 10_000, lengthM: 50_000 }])).toBe(2500)
    expect(nextLoopLength(10_000, [{ requestedM: 10_000, lengthM: 2_000 }])).toBe(20_000)
    expect(nextLoopLength(90_000, [{ requestedM: 90_000, lengthM: 60_000 }])).toBe(100_000)
    expect(nextLoopLength(1_500, [{ requestedM: 1_500, lengthM: 3_000 }])).toBe(1000)
  })
})

describe('loopLengthForDuration', () => {
  it('turns a duration into a distance at the sport speed on the flat', () => {
    expect(loopLengthForDuration('running', 60)).toBe(10_000)
    expect(loopLengthForDuration('hiking', 90)).toBe(7500)
    expect(loopLengthForDuration('road_cycling', 120)).toBe(50_000)
    // At the member's pace (#146): 5:00/km for an hour
    expect(loopLengthForDuration('running', 60, 5)).toBe(12_000)
  })

  it('counts the climbing (#214)', () => {
    // 10 m per km: 1.1 km-effort per km, 6.6 min at 6:00/km
    expect(loopLengthForDuration('running', 60, undefined, 10)).toBe(9091)
    // 12 min per km on the flat, plus 1 h per 600 m: 30 m per km add 3 min
    expect(loopLengthForDuration('hiking', 90, undefined, 30)).toBe(6000)
  })
})

describe('climbing (#214)', () => {
  it('tells flat, rolling and hilly outings apart by gain per km, by sport', () => {
    expect(climbOf('running', 10_000, 80)).toBe('flat')
    expect(climbOf('running', 10_000, 150)).toBe('rolling')
    expect(climbOf('running', 10_000, 200)).toBe('hilly')
    expect(climbOf('trail', 15_000, 600)).toBe('hilly')
    expect(climbOf('hiking', 15_000, 300)).toBe('rolling')
    expect(climbOf('road_cycling', 60_000, 300)).toBe('flat')
    expect(climbOf('running', 10_000, null)).toBe('flat')
    expect(climbOf('running', 0, 100)).toBe('flat')
  })

  it('turns each level into a typical gain per km', () => {
    expect(typicalGainPerKm('running', 'flat')).toBe(4)
    expect(typicalGainPerKm('running', 'rolling')).toBe(14)
    expect(typicalGainPerKm('running', 'hilly')).toBe(25)
  })

  it('ranks the proposals by the climbing asked for, the missing ones last', () => {
    const proposals = [
      { id: 'failed', status: 'failed', distanceM: 0, gainM: null },
      { id: 'flat', status: 'ready', distanceM: 10_000, gainM: 50 },
      { id: 'hilly', status: 'ready', distanceM: 10_000, gainM: 300 },
      { id: 'rolling', status: 'ready', distanceM: 10_000, gainM: 130 },
    ]
    const ids = (climb: LoopClimb) => rankByClimb(proposals, 'running', climb).map(({ id }) => id)
    expect(ids('flat')).toEqual(['flat', 'rolling', 'hilly', 'failed'])
    expect(ids('hilly')).toEqual(['hilly', 'rolling', 'flat', 'failed'])
    expect(ids('rolling')).toEqual(['rolling', 'flat', 'hilly', 'failed'])
    // Ties keep their order.
    expect(rankByClimb([proposals[1]!, { ...proposals[1]!, id: 'twin' }], 'running', 'hilly').map(({ id }) => id)).toEqual(['flat', 'twin'])
  })

  it('ranks the proposals closest first to a gain per km', () => {
    const proposals = [
      { id: 'failed', status: 'failed', distanceM: 0, gainM: null },
      { id: 'flat', status: 'ready', distanceM: 10_000, gainM: 50 },
      { id: 'hilly', status: 'ready', distanceM: 10_000, gainM: 300 },
      { id: 'rolling', status: 'ready', distanceM: 10_000, gainM: 130 },
    ]
    // 250 m over 10 km: the hilliest first.
    expect(rankByGain(proposals, 25).map(({ id }) => id)).toEqual(['hilly', 'rolling', 'flat', 'failed'])
  })
})

describe('isOnTarget with a range (#214)', () => {
  it('accepts loops within 20 %', () => {
    expect(isOnTarget(8_000, 10_000, LOOP_TOLERANCES.range)).toBe(true)
    expect(isOnTarget(12_000, 10_000, LOOP_TOLERANCES.range)).toBe(true)
    expect(isOnTarget(12_100, 10_000, LOOP_TOLERANCES.range)).toBe(false)
    expect(isOnTarget(8_500, 10_000, LOOP_TOLERANCES.precise)).toBe(false)
  })
})

const metres = (from: LngLat, to: LngLat) => distance(from, to, { units: 'meters' })
const START: LngLat = [6.12, 45.9]
// 3 km north of the start
const PEAK: LngLat = [6.12, 45.926979]

describe('seedBearing', () => {
  it('points consecutive seeds in directions far apart', () => {
    for (const seed of [0, 1, 41, 999_997]) {
      const turn = Math.abs(seedBearing(seed + 1) - seedBearing(seed)) % 360
      expect(Math.min(turn, 360 - turn)).toBeGreaterThan(100)
      expect(seedBearing(seed)).toBeGreaterThanOrEqual(-180)
      expect(seedBearing(seed)).toBeLessThan(180)
    }
  })
})

describe('loopCorner', () => {
  it('closes a triangle through the place of the asked perimeter, whatever the angle', () => {
    for (const angle of [-145, -60, 35, 90, 145]) {
      const corner = loopCorner(START, PEAK, 10_000, angle)
      const perimeter = metres(START, PEAK) + metres(PEAK, corner) + metres(corner, START)
      expect(perimeter).toBeGreaterThan(9_950)
      expect(perimeter).toBeLessThan(10_050)
    }
  })

  it('never makes it shorter than going to the place and back', () => {
    const corner = loopCorner(START, PEAK, 4_000, 90)
    const perimeter = metres(START, PEAK) + metres(PEAK, corner) + metres(corner, START)
    expect(Math.abs(perimeter - 6_000)).toBeLessThan(30)
  })
})

describe('loopRoutePoints', () => {
  it('leaves plain loops to the round trips', () => {
    expect(loopRoutePoints('loop', START, 10_000, 3)).toBeNull()
  })

  it('goes through the place and a third corner, back to the start', () => {
    const route = loopRoutePoints('loop', START, 13_000, 3, PEAK)!
    expect(route.points).toHaveLength(4)
    expect(route.points[0]).toEqual(START)
    expect(route.points[1]).toEqual(PEAK)
    expect(route.points[3]).toEqual(START)
    expect(route.radiuses).toEqual([350, 1000, -1, 350])
    // 13 km along paths are 10 km as the crow flies.
    const [, , corner] = route.points
    expect(Math.abs(metres(START, PEAK) + metres(PEAK, corner!) + metres(corner!, START) - 10_000)).toBeLessThan(50)
    // Each seed turns another way.
    expect(loopRoutePoints('loop', START, 13_000, 4, PEAK)!.points[2]).not.toEqual(corner)
  })

  it('sends an out and back half the way as the crow flies, in the seed\'s direction', () => {
    const route = loopRoutePoints('out_and_back', START, 13_000, 7)!
    expect(route.points).toHaveLength(2)
    expect(route.radiuses).toEqual([350, -1])
    expect(metres(START, route.points[1]!)).toBeCloseTo(5_000, -1)
  })

  it('takes an out and back through the place, and beyond when there is room', () => {
    const near = loopRoutePoints('out_and_back', START, 8_000, 7, PEAK)!
    expect(near.points).toEqual([START, PEAK])
    expect(near.radiuses).toEqual([350, 1000])

    const far = loopRoutePoints('out_and_back', START, 13_000, 0, PEAK)!
    expect(far.points.slice(0, 2)).toEqual([START, PEAK])
    expect(metres(START, far.points[2]!)).toBeCloseTo(5_000, -1)
    expect(far.radiuses).toEqual([350, 1000, -1])
  })
})

describe('loopRoutePoints through a far place', () => {
  it('goes straight there and back when that is already the whole loop', () => {
    const route = loopRoutePoints('loop', START, 7_700, 3, PEAK)!
    expect(route.points).toEqual([START, PEAK, START])
    expect(route.radiuses).toEqual([350, 1000, 350])
  })
})

describe('isViaInReach', () => {
  it('accepts places the browser could have picked only', () => {
    expect(isViaInReach(START, PEAK)).toBe(true)
    expect(isViaInReach(START, [START[0], START[1] + 0.1])).toBe(false)
  })
})

describe('isShortestThrough', () => {
  it('tells when asking less can\'t shorten a route through the place', () => {
    // 3 km away: 6 km there and back as the crow flies, 7.8 km along paths.
    expect(isShortestThrough('loop', START, 7_700, PEAK)).toBe(true)
    expect(isShortestThrough('loop', START, 8_500, PEAK)).toBe(false)
    expect(isShortestThrough('out_and_back', START, 8_000, PEAK)).toBe(true)
    expect(isShortestThrough('out_and_back', START, 9_000, PEAK)).toBe(false)
  })
})

describe('outAndBack', () => {
  it('comes back the same way, with the ways mirrored', () => {
    const points: LngLatEle[] = [[6.1, 45.9, 100], [6.11, 45.9, 120], [6.12, 45.9, 150]]
    const wayInfo: WayInfo = { surface: [[0, 1, 1], [1, 2, 3]], waytype: [[0, 2, 4]], sac_scale: [], mtb_scale: [] }
    const { points: track, wayInfo: ways } = outAndBack(points, wayInfo)
    expect(track.map(([, , ele]) => ele)).toEqual([100, 120, 150, 120, 100])
    expect(ways!.surface).toEqual([[0, 1, 1], [1, 2, 3], [2, 3, 3], [3, 4, 1]])
    expect(ways!.waytype).toEqual([[0, 2, 4], [2, 4, 4]])
    expect(outAndBack(points, null).wayInfo).toBeNull()
  })
})

describe('places to go through', () => {
  it('looks within the length there and back, at most 10 km', () => {
    expect(viaSearchRadius(13_000, 0.1)).toBe(5500)
    expect(viaSearchRadius(100_000, 0.2)).toBe(10_000)
  })

  it('asks Overpass around the start, latitude first', () => {
    expect(loopViaQuery('peak', START, 5000, 25)).toBe('[out:json][timeout:25];node["natural"="peak"]["ele"](around:5000,45.9,6.12);out;')
    expect(loopViaQuery('water', START, 5000, 25)).toContain('nwr["amenity"="drinking_water"](around:5000,45.9,6.12);')
  })

  it('keeps the places the route page would show', () => {
    const places = loopViaPlaces([
      { type: 'node', id: 1, lat: 45.92, lon: 6.12, tags: { natural: 'peak', ele: '1 234', name: 'Mont' } },
      { type: 'node', id: 2, lat: 45.92, lon: 6.12, tags: { amenity: 'drinking_water', access: 'private' } },
      { type: 'way', id: 3, center: { lat: 45.91, lon: 6.12 }, tags: { natural: 'spring', drinking_water: 'yes' } },
    ])
    expect(places.map(({ id, type, ele }) => ({ id, type, ele }))).toEqual([
      { id: 'n1', type: 'peak', ele: 1234 },
      { id: 'w3', type: 'water', ele: undefined },
    ])
  })

  it('picks the highest peak in reach, and the water point nearest to halfway', () => {
    const place = (id: string, type: 'peak' | 'water', lat: number, ele?: number): OsmPlace =>
      ({ id, type, coordinates: [6.12, lat], ...(ele === undefined ? {} : { ele }) })
    const places = [
      place('low', 'peak', 45.91, 800),
      place('high', 'peak', 45.93, 1500),
      place('far', 'peak', 46.1, 3000),
      place('unknown', 'peak', 45.92),
      place('start', 'water', 45.9001),
      place('half', 'water', 45.922),
    ]
    expect(pickLoopVia('peak', places, START, 5000)?.id).toBe('high')
    expect(pickLoopVia('water', places, START, 5000)?.id).toBe('half')
    expect(pickLoopVia('peak', places, START, 500)).toBeNull()
  })
})

describe('loopWaypointIndices', () => {
  it('cuts a 10 km loop every 2 km, at points of the track', () => {
    const loop = squareLoop(2500)
    const indices = loopWaypointIndices(loop)
    expect(indices).toHaveLength(6)
    expect(indices[0]).toBe(0)
    expect(indices.at(-1)).toBe(loop.length - 1)
    // Within a point (100 m) after each fifth of the loop.
    const along = trackDistances(loop)
    const total = along.at(-1)!
    indices.slice(1, -1).forEach((index, k) => {
      expect(along[index]! - (k + 1) * total / 5).toBeGreaterThanOrEqual(0)
      expect(along[index]! - (k + 1) * total / 5).toBeLessThan(101)
    })
  })

  it('keeps 4 segments on short loops and 10 on long ones', () => {
    expect(loopWaypointIndices(squareLoop(500))).toHaveLength(5)
    expect(loopWaypointIndices(squareLoop(15_000))).toHaveLength(11)
  })

  it('never repeats a point when the loop has few of them', () => {
    const loop: LngLat[] = [[6.12, 45.9], [6.13, 45.9], [6.12, 45.9]]
    expect(loopWaypointIndices(loop)).toEqual([0, 1, 2])
  })
})
