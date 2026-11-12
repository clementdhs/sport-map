import { describe, expect, it } from 'vitest'
import { distance } from '@turf/turf'
import {
  fitVias, isShortestThrough, isViaInReach, loopRoutePoints, maxTourCrowM, NAMED_PLACE_SEARCH_M,
  type NamedPlace, type NamedPlaceChoice, namedPlaceReach, namedPlacesPlan, orderVias, tourCrowM, VIA_SEARCH_MAX_M,
  viaSearchRadius,
} from '#shared/utils/loops'
import { type LngLat, LOOP_MAX_VIAS } from '#shared/utils/routes'

// Several named places in one loop, further than 10 km (#326). From Grenoble: Autrans 14 km west, Lans-en-Vercors
// 12.6 km west-south-west, 6 km apart.
const GRENOBLE: LngLat = [5.7245, 45.1885]
const AUTRANS: LngLat = [5.5434, 45.1753]
const LANS: LngLat = [5.5886, 45.1283]
// North and east of Grenoble, to check the order around the start.
const NORTH: LngLat = [5.7245, 45.27]
const EAST: LngLat = [5.84, 45.1885]
const SOUTH: LngLat = [5.7245, 45.1]

const metres = (from: LngLat, to: LngLat) => distance(from, to, { units: 'meters' })
const same = (point: LngLat) => point

function place(id: string, coordinates: LngLat, kind: NamedPlace['kind'] = 'village'): NamedPlace {
  return { id, name: id, kind, coordinates, distanceM: Math.round(metres(GRENOBLE, coordinates)) }
}

describe('reach of a named place (#326)', () => {
  it('reaches as far as going there and back fits in the length', () => {
    // 70 km within 10 %: 77 km along paths, 59.2 km as the crow flies, half of it each way.
    expect(maxTourCrowM(70_000, 0.1)).toBeCloseTo(59_231, 0)
    expect(namedPlaceReach(70_000, 0.1)).toBe(29_615)
    expect(namedPlaceReach(10_000, 0.1)).toBe(4231)
  })

  it('stops at the named place search, 30 km', () => {
    expect(namedPlaceReach(100_000, 0.2)).toBe(NAMED_PLACE_SEARCH_M)
  })

  it('keeps the 10 km cap of the peak and water search', () => {
    expect(viaSearchRadius(70_000, 0.1)).toBe(VIA_SEARCH_MAX_M)
  })

  it('lets the server route through Autrans for a 70 km loop, not for a 20 km one', () => {
    expect(isViaInReach(GRENOBLE, AUTRANS, 70_000, 0.1)).toBe(true)
    expect(isViaInReach(GRENOBLE, AUTRANS, 20_000, 0.1)).toBe(false)
  })
})

describe('order of the places around the start (#326)', () => {
  it('visits the places by their bearing, clockwise', () => {
    expect(orderVias('loop', GRENOBLE, [EAST, NORTH, SOUTH], same)).toEqual([NORTH, EAST, SOUTH])
  })

  it('turns the other way counter-clockwise', () => {
    expect(orderVias('loop', GRENOBLE, [EAST, NORTH, SOUTH], same, false)).toEqual([SOUTH, EAST, NORTH])
  })

  it('starts after the widest gap, so the tour does not cross the start\'s side', () => {
    // Lans (236°) then Autrans (276°): going from Autrans to Lans clockwise would turn all around.
    expect(orderVias('loop', GRENOBLE, [AUTRANS, LANS], same)).toEqual([LANS, AUTRANS])
    expect(orderVias('loop', GRENOBLE, [AUTRANS, LANS], same, false)).toEqual([AUTRANS, LANS])
  })

  it('takes an out and back through the nearest place first', () => {
    expect(orderVias('out_and_back', GRENOBLE, [AUTRANS, LANS], same)).toEqual([LANS, AUTRANS])
  })

  it('measures the tour as the crow flies, back to the start for a loop, twice the way out for an out and back', () => {
    const loop = metres(GRENOBLE, LANS) + metres(LANS, AUTRANS) + metres(AUTRANS, GRENOBLE)
    expect(tourCrowM('loop', GRENOBLE, [LANS, AUTRANS])).toBeCloseTo(loop, 0)
    const out = metres(GRENOBLE, LANS) + metres(LANS, AUTRANS)
    expect(tourCrowM('out_and_back', GRENOBLE, [LANS, AUTRANS])).toBeCloseTo(2 * out, 0)
  })
})

describe('places that fit the length (#326)', () => {
  it('keeps every place a 70 km loop can go through, in their order', () => {
    expect(fitVias('loop', GRENOBLE, [AUTRANS, LANS], same, 70_000, 0.1)).toEqual({ kept: [LANS, AUTRANS], dropped: [] })
  })

  it('drops the place costing the longest detour first', () => {
    // 40 km within 10 %: 33.8 km as the crow flies. Lans and Autrans make a 33 km tour; Chamrousse, 15 km south-east,
    // would add the most.
    const chamrousse: LngLat = [5.8756, 45.1105]
    const { kept, dropped } = fitVias('loop', GRENOBLE, [AUTRANS, LANS, chamrousse], same, 40_000, 0.1)
    expect(dropped).toEqual([chamrousse])
    expect(kept).toEqual([LANS, AUTRANS])
  })

  it('drops a place too far even alone', () => {
    expect(fitVias('loop', GRENOBLE, [AUTRANS, NORTH], same, 25_000, 0.1)).toEqual({ kept: [NORTH], dropped: [AUTRANS] })
  })

  it('caps the number of places', () => {
    const many = Array.from({ length: LOOP_MAX_VIAS + 2 }, (_, i): LngLat => [5.72 + i * 0.002, 45.19])
    expect(fitVias('loop', GRENOBLE, many, same, 100_000, 0.2).kept).toHaveLength(LOOP_MAX_VIAS)
  })
})

describe('named places of one loop (#326)', () => {
  const via = (found: NamedPlace): NamedPlaceChoice => ({ role: 'via', place: found })
  const heading = (found: NamedPlace): NamedPlaceChoice => ({ role: 'heading', place: found, bearingDeg: 0 })

  it('goes through every place in reach, in their order around the start', () => {
    const autrans = place('Autrans', AUTRANS)
    const lans = place('Lans-en-Vercors', LANS)
    expect(namedPlacesPlan('loop', GRENOBLE, [via(autrans), via(lans)], 70_000, 0.1))
      .toEqual({ vias: [lans, autrans], heading: null, setAside: [] })
  })

  it('sets aside the places that do not fit the length, and headings when there are places to go through', () => {
    const autrans = place('Autrans', AUTRANS)
    const north = place('Nord', NORTH)
    const massif = heading(place('Chartreuse', NORTH, 'massif'))
    const plan = namedPlacesPlan('loop', GRENOBLE, [via(autrans), via(north), massif], 25_000, 0.1)
    expect(plan.vias).toEqual([north])
    expect(plan.heading).toBeNull()
    expect(plan.setAside).toEqual([via(autrans), massif])
  })

  it('heads for the first heading when there is no place to go through', () => {
    const massif = heading(place('Chartreuse', NORTH, 'massif'))
    const vercors = heading(place('Vercors', LANS, 'massif'))
    expect(namedPlacesPlan('loop', GRENOBLE, [massif, vercors], 70_000, 0.1))
      .toEqual({ vias: [], heading: massif, setAside: [vercors] })
  })
})

describe('loopRoutePoints through several places (#326)', () => {
  it('goes start → places in the seed\'s direction → start, with the places\' snapping radius', () => {
    // 43 km along paths: 33.1 km as the crow flies, just under the 33.2 km tour.
    const clockwise = loopRoutePoints('loop', GRENOBLE, 43_000, 2, [AUTRANS, LANS])!
    expect(clockwise.points).toEqual([GRENOBLE, LANS, AUTRANS, GRENOBLE])
    expect(clockwise.radiuses).toEqual([350, 1000, 1000, 350])
    const counter = loopRoutePoints('loop', GRENOBLE, 43_000, 3, [AUTRANS, LANS])!
    expect(counter.points).toEqual([GRENOBLE, AUTRANS, LANS, GRENOBLE])
  })

  it('stretches a short tour with a detour on one leg, picked by the seed, to the length', () => {
    const tour = tourCrowM('loop', GRENOBLE, [LANS, AUTRANS])
    const crowM = 70_000 / 1.3
    const corners: LngLat[] = []
    for (const seed of [10, 11, 12]) {
      const route = loopRoutePoints('loop', GRENOBLE, 70_000, seed, [AUTRANS, LANS])!
      expect(route.points).toHaveLength(5)
      expect(route.points[0]).toEqual(GRENOBLE)
      expect(route.points.at(-1)).toEqual(GRENOBLE)
      expect(route.points.filter(point => point === AUTRANS || point === LANS)).toHaveLength(2)
      const corner = route.radiuses.indexOf(-1)
      expect(corner).toBeGreaterThan(0)
      corners.push(route.points[corner]!)
      const perimeter = route.points.slice(1).reduce((sum, point, i) => sum + metres(route.points[i]!, point), 0)
      expect(Math.abs(perimeter - crowM)).toBeLessThan(100)
      expect(perimeter).toBeGreaterThan(tour)
    }
    // Three seeds, three different legs (the corner's place in the list also depends on the direction).
    expect(metres(corners[0]!, corners[1]!)).toBeGreaterThan(1000)
    expect(metres(corners[1]!, corners[2]!)).toBeGreaterThan(1000)
    expect(metres(corners[0]!, corners[2]!)).toBeGreaterThan(1000)
  })

  it('takes an out and back through the places, nearest first, and beyond the last when there is room', () => {
    const near = loopRoutePoints('out_and_back', GRENOBLE, 40_000, 0, [AUTRANS, LANS])!
    expect(near.points).toEqual([GRENOBLE, LANS, AUTRANS])
    expect(near.radiuses).toEqual([350, 1000, 1000])

    const far = loopRoutePoints('out_and_back', GRENOBLE, 70_000, 0, [AUTRANS, LANS])!
    expect(far.points.slice(0, 3)).toEqual([GRENOBLE, LANS, AUTRANS])
    expect(far.radiuses).toEqual([350, 1000, 1000, -1])
    const out = metres(GRENOBLE, LANS) + metres(LANS, AUTRANS) + metres(AUTRANS, far.points[3]!)
    expect(Math.abs(out - 70_000 / 1.3 / 2)).toBeLessThan(100)
  })

  it('tells when the tour through the places is already the shortest', () => {
    expect(isShortestThrough('loop', GRENOBLE, 43_000, [AUTRANS, LANS])).toBe(true)
    expect(isShortestThrough('loop', GRENOBLE, 70_000, [AUTRANS, LANS])).toBe(false)
    expect(isShortestThrough('out_and_back', GRENOBLE, 40_000, [AUTRANS, LANS])).toBe(true)
    expect(isShortestThrough('out_and_back', GRENOBLE, 70_000, [AUTRANS, LANS])).toBe(false)
  })
})
