import { describe, expect, it } from 'vitest'
import {
  activeOsmFilterCount, defaultOsmFilters, matchesOsmFilters, OSM_DISTANCE_MAX_KM, osmDiscoverQuery, type OsmRouteFilters,
  osmRouteShape, parseOsmDiscoverQuery,
} from '#shared/utils/osmFilters'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'

const START: LngLat = [2.6, 48.4]
// About 110 m north of the start: a loop.
const NEAR: LngLat = [2.6, 48.401]
// About 1.1 km north: a linear route.
const FAR: LngLat = [2.6, 48.41]
const SIDE: LngLat = [2.61, 48.405]

const route = (overrides: Partial<OsmRoute> = {}): OsmRoute => ({
  id: 1, route: 'hiking', name: 'Sentier', ref: null, network: 'lwn', roundtrip: null, grade: null, complete: true,
  distance_m: 8000, lines: [[START, SIDE, FAR]], ...overrides,
})

const filters = (overrides: Partial<OsmRouteFilters>): OsmRouteFilters => ({ ...defaultOsmFilters(), ...overrides })

describe('osmRouteShape', () => {
  it('trusts the roundtrip tag when the relation has one', () => {
    expect(osmRouteShape(route({ roundtrip: true }))).toBe('loop')
    expect(osmRouteShape(route({ roundtrip: false, lines: [[START, SIDE, START]] }))).toBe('linear')
    expect(osmRouteShape(route({ roundtrip: true, complete: false, lines: [[START, SIDE], [FAR, NEAR]] }))).toBe('loop')
  })

  it('compares where the line starts and ends without the tag', () => {
    expect(osmRouteShape(route({ lines: [[START, SIDE, NEAR]] }))).toBe('loop')
    expect(osmRouteShape(route({ lines: [[START, SIDE, FAR]] }))).toBe('linear')
  })

  it('doesn\'t know the shape of a relation whose ways don\'t connect', () => {
    expect(osmRouteShape(route({ complete: false, lines: [[START, SIDE], [FAR, NEAR]] }))).toBe('unknown')
  })
})

describe('matchesOsmFilters', () => {
  const loop = route({ roundtrip: true })
  const linear = route({ roundtrip: false })
  const broken = route({ complete: false, lines: [[START, SIDE], [FAR, NEAR]] })

  it('keeps everything without filters', () => {
    for (const each of [loop, linear, broken]) expect(matchesOsmFilters(each, defaultOsmFilters())).toBe(true)
  })

  it('keeps the routes within the distance range, the top of the slider meaning no maximum', () => {
    expect(matchesOsmFilters(loop, filters({ distanceKm: [5, 10] }))).toBe(true)
    expect(matchesOsmFilters(loop, filters({ distanceKm: [10, 20] }))).toBe(false)
    expect(matchesOsmFilters(route({ distance_m: 300_000 }), filters({ distanceKm: [50, OSM_DISTANCE_MAX_KM] }))).toBe(true)
  })

  it('also counts a linear route there and back when asked', () => {
    const range = filters({ distanceKm: [15, 20] })
    expect(matchesOsmFilters(linear, range)).toBe(false)
    expect(matchesOsmFilters(linear, { ...range, outAndBack: true })).toBe(true)
    expect(matchesOsmFilters(linear, { ...range, outAndBack: true, distanceKm: [5, 10] })).toBe(true)
    expect(matchesOsmFilters(loop, { ...range, outAndBack: true })).toBe(false)
  })

  it('keeps loops or linear routes, not the ones whose shape is unknown', () => {
    expect(matchesOsmFilters(loop, filters({ shape: 'loop' }))).toBe(true)
    expect(matchesOsmFilters(linear, filters({ shape: 'loop' }))).toBe(false)
    expect(matchesOsmFilters(linear, filters({ shape: 'linear' }))).toBe(true)
    expect(matchesOsmFilters(broken, filters({ shape: 'loop' }))).toBe(false)
  })

  it('hides harder routes, never the ungraded ones', () => {
    expect(matchesOsmFilters(route({ grade: 2 }), filters({ maxGrade: 2 }))).toBe(true)
    expect(matchesOsmFilters(route({ grade: 3 }), filters({ maxGrade: 2 }))).toBe(false)
    expect(matchesOsmFilters(route({ grade: null }), filters({ maxGrade: 1 }))).toBe(true)
  })

  it('keeps the chosen scopes, and the routes without a known network', () => {
    const local = filters({ scopes: ['local'] })
    expect(matchesOsmFilters(route({ network: 'lwn' }), local)).toBe(true)
    expect(matchesOsmFilters(route({ network: 'nwn' }), local)).toBe(false)
    expect(matchesOsmFilters(route({ network: null }), local)).toBe(true)
  })

  it('combines the filters', () => {
    const combined = filters({ distanceKm: [5, 10], shape: 'loop', scopes: ['local'] })
    expect(matchesOsmFilters(loop, combined)).toBe(true)
    expect(matchesOsmFilters(route({ roundtrip: true, network: 'rwn' }), combined)).toBe(false)
    expect(matchesOsmFilters(route({ roundtrip: true, distance_m: 12_000 }), combined)).toBe(false)
  })
})

describe('activeOsmFilterCount', () => {
  it('counts each filter changed from its default', () => {
    expect(activeOsmFilterCount(defaultOsmFilters())).toBe(0)
    expect(activeOsmFilterCount(filters({ outAndBack: true }))).toBe(0)
    expect(activeOsmFilterCount(filters({ distanceKm: [5, OSM_DISTANCE_MAX_KM], shape: 'loop', maxGrade: 2, scopes: ['local'] }))).toBe(4)
  })
})

describe('page URL', () => {
  it('only holds what differs from the defaults', () => {
    expect(osmDiscoverQuery({ kind: 'foot', filters: defaultOsmFilters(), view: null })).toEqual({})
  })

  it('reads back the kind, the filters and the view it wrote', () => {
    const state = {
      kind: 'mtb' as const,
      filters: filters({ distanceKm: [5, 20], outAndBack: true, shape: 'loop', maxGrade: 2, scopes: ['local', 'regional'] }),
      view: { center: [2.65, 48.415] as LngLat, zoom: 13 },
    }
    const query = osmDiscoverQuery(state)
    expect(query).toEqual({ kind: 'mtb', km: '5-20', ar: '1', shape: 'loop', grade: '2', scope: 'local,regional', at: '48.415,2.65,13' })
    expect(parseOsmDiscoverQuery(query)).toEqual(state)
  })

  it('writes an open distance range without its missing bound', () => {
    expect(osmDiscoverQuery({ kind: 'foot', filters: filters({ distanceKm: [10, OSM_DISTANCE_MAX_KM] }), view: null }).km).toBe('10-')
    expect(parseOsmDiscoverQuery({ km: '-20' }).filters.distanceKm).toEqual([0, 20])
  })

  it('falls back to the defaults on values it doesn\'t know', () => {
    expect(parseOsmDiscoverQuery({ kind: 'canoe', km: '20-5', shape: 'spiral', grade: '9', scope: 'galactic', at: '95,2,13' }))
      .toEqual({ kind: 'foot', filters: defaultOsmFilters(), view: null })
    // S2 doesn't exist on the walking scale: only T1 to T3 can be picked.
    expect(parseOsmDiscoverQuery({ grade: '0' }).filters.maxGrade).toBeNull()
    expect(parseOsmDiscoverQuery({ kind: ['mtb', 'foot'] }).kind).toBe('mtb')
  })
})
