import { distance } from '@turf/turf'
import { describe, expect, it } from 'vitest'
import {
  bboxAreaKm2, bboxContains, fitsOsmSearch, type OsmRoute, osmRouteBbox, osmRouteScope, osmSearchBbox, type OverpassMember,
  type OverpassRelation, sortOsmRoutes, stitchWays, toOsmRoute,
} from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'
import fontainebleau from '../fixtures/overpass-fontainebleau.json'

// About 100 m apart, zigzagging: simplifying the line keeps every point.
const A: LngLat = [2.6, 48.4]
const B: LngLat = [2.601, 48.401]
const C: LngLat = [2.602, 48.4]
const D: LngLat = [2.603, 48.401]
const E: LngLat = [2.604, 48.4]

const relations = fontainebleau.elements as OverpassRelation[]
const relation = (id: number) => relations.find(element => element.id === id)!

describe('stitchWays', () => {
  it('chains ways listed in order, without repeating the shared points', () => {
    expect(stitchWays([[A, B], [B, C], [C, D]])).toEqual([[A, B, C, D]])
  })

  it('turns the ways drawn the other way', () => {
    expect(stitchWays([[A, B], [C, B], [C, D]])).toEqual([[A, B, C, D]])
  })

  it('turns the first way when the second one starts from its start', () => {
    expect(stitchWays([[B, A], [B, C]])).toEqual([[A, B, C]])
  })

  it('joins members listed out of order', () => {
    expect(stitchWays([[C, D], [A, B], [D, E], [B, C]])).toEqual([[A, B, C, D, E]])
  })

  it('keeps an out-and-back that uses the same ways twice', () => {
    expect(stitchWays([[A, B], [B, C], [B, C], [A, B]])).toEqual([[A, B, C, B, A]])
  })

  it('bridges a small mapping gap with a straight line', () => {
    const nearC: LngLat = [2.6022, 48.4]
    expect(distance(C, nearC, { units: 'meters' })).toBeLessThan(30)
    expect(stitchWays([[A, B, C], [nearC, D]])).toEqual([[A, B, C, nearC, D]])
  })

  it('returns separate pieces when ways are too far apart', () => {
    expect(stitchWays([[A, B], [D, E]])).toEqual([[A, B], [D, E]])
  })

  it('ignores ways without two points', () => {
    expect(stitchWays([])).toEqual([])
    expect(stitchWays([[A]])).toEqual([])
    expect(stitchWays([[A], [A, B]])).toEqual([[A, B]])
  })
})

describe('toOsmRoute', () => {
  const way = (points: LngLat[], role = ''): OverpassMember =>
    ({ type: 'way', ref: 1, role, geometry: points.map(([lon, lat]) => ({ lat, lon })) })

  it('reads the tags of the relation', () => {
    const route = toOsmRoute({
      type: 'relation',
      id: 42,
      version: 7,
      tags: { type: 'route', route: 'hiking', name: ' Tour du lac ', ref: 'PR 3', network: 'lwn', roundtrip: 'no' },
      members: [way([A, B])],
    })
    expect(route).toMatchObject({
      id: 42, version: 7, route: 'hiking', name: 'Tour du lac', ref: 'PR 3', network: 'lwn', roundtrip: false, complete: true,
    })
    expect(route!.distance_m).toBe(Math.round(distance(A, B, { units: 'meters' })))
  })

  it.each([
    [{ route: 'hiking', sac_scale: 'mountain_hiking' }, 2],
    [{ route: 'foot', sac_scale: 'difficult_alpine_hiking' }, 6],
    [{ route: 'mtb', 'mtb:scale': '2+' }, 2],
    [{ route: 'mtb', 'mtb:scale': '0' }, 0],
    [{ route: 'mtb', 'mtb:scale': 'S3' }, null],
    [{ route: 'bicycle', sac_scale: 'hiking' }, null],
    [{ route: 'hiking' }, null],
  ])('reads the difficulty of %o', (tags, grade) => {
    expect(toOsmRoute({ type: 'relation', id: 1, tags, members: [way([A, B])] })!.grade).toBe(grade)
  })

  it('leaves missing tags empty', () => {
    expect(toOsmRoute({ type: 'relation', id: 1, members: [way([A, B])] }))
      .toMatchObject({ route: '', name: null, ref: null, network: null, roundtrip: null })
  })

  it('skips side trips, nodes, sub-relations and missing nodes', () => {
    const route = toOsmRoute({
      type: 'relation',
      id: 1,
      members: [
        way([A, B]),
        { type: 'node', ref: 2, role: 'guidepost' },
        way([B, E], 'excursion'),
        { type: 'relation', ref: 3, role: '' },
        { type: 'way', ref: 4, role: '', geometry: [{ lat: B[1], lon: B[0] }, null, { lat: C[1], lon: C[0] }] },
      ],
    })
    expect(route!.lines).toEqual([[A, B, C]])
  })

  it('returns null without any geometry', () => {
    expect(toOsmRoute({ type: 'relation', id: 1, members: [{ type: 'way', ref: 1, role: '' }] })).toBeNull()
  })

  it('stitches a marked loop of Fontainebleau into a closed line', () => {
    const route = toOsmRoute(relation(389996))!
    expect(route).toMatchObject({ name: 'Sentier Denecourt-Colinet 1', roundtrip: true, complete: true })
    expect(route.lines).toHaveLength(1)
    expect(route.lines[0]![0]).toEqual(route.lines[0]!.at(-1))
    expect(route.distance_m).toBeGreaterThan(3500)
    expect(route.distance_m).toBeLessThan(4100)
  })

  it('stitches a relation whose members are out of order', () => {
    const route = toOsmRoute(relation(157632))!
    expect(route.complete).toBe(true)
    expect(route.distance_m).toBeGreaterThan(10_000)
  })

  it('reports a relation that turns in the middle of its ways as incomplete', () => {
    const route = toOsmRoute(relation(255680))!
    expect(route.complete).toBe(false)
    expect(route.lines.length).toBeGreaterThan(1)
  })

  it('ignores the sub-relations of a route', () => {
    expect(toOsmRoute(relation(2901743))!.complete).toBe(true)
  })

  it('simplifies and rounds the geometry', () => {
    const raw = relation(389996).members.reduce((sum, member) => sum + (member.geometry?.length ?? 0), 0)
    const { lines } = toOsmRoute(relation(389996))!
    expect(lines[0]!.length).toBeLessThan(raw)
    for (const [lng, lat] of lines[0]!) {
      expect(Math.round(lng * 1e6) / 1e6).toBe(lng)
      expect(Math.round(lat * 1e6) / 1e6).toBe(lat)
    }
  })
})

describe('search area', () => {
  it('rounds the view outwards to the 0.01° grid', () => {
    expect(osmSearchBbox([2.583, 48.381, 2.718, 48.459])).toEqual([2.58, 48.38, 2.72, 48.46])
    expect(osmSearchBbox([2.58, 48.38, 2.72, 48.46])).toEqual([2.58, 48.38, 2.72, 48.46])
  })

  it('measures the area in km²', () => {
    // About 10 km by 9 km around Fontainebleau.
    expect(bboxAreaKm2([2.58, 48.38, 2.72, 48.46])).toBeCloseTo(92, 0)
  })

  it('refuses views much wider than a forest', () => {
    expect(fitsOsmSearch([2.58, 48.38, 2.72, 48.46])).toBe(true)
    // A desktop map at zoom 11.
    expect(fitsOsmSearch([2.3, 48.25, 3.0, 48.6])).toBe(false)
  })
})

describe('route list', () => {
  const route = (id: number, overrides: Partial<OsmRoute> = {}): OsmRoute => ({
    id, route: 'hiking', name: null, ref: null, network: 'lwn', roundtrip: null, grade: null, complete: true, distance_m: 1000, lines: [[A, B]], ...overrides,
  })

  it.each([
    ['lwn', 'local'], ['rwn', 'regional'], ['nwn', 'national'], ['iwn', 'international'], ['lcn', 'local'], ['icn', 'international'],
    ['proposed', null], [null, null],
  ] as const)('reads the reach of the %s network', (network, scope) => {
    expect(osmRouteScope(network)).toBe(scope)
  })

  it('lists complete, local, named routes first, numbers in order', () => {
    const sorted = sortOsmRoutes([
      route(1, { name: 'Sentier 10' }),
      route(2, { name: 'GR 1', network: 'nwn' }),
      route(3, { name: 'Sentier 2' }),
      route(4, { name: 'Boucle cassée', complete: false }),
      route(5),
      route(6, { ref: 'PR 3' }),
      route(7, { name: 'Tour du massif', network: 'rwn' }),
    ], 'fr')
    expect(sorted.map(({ id }) => id)).toEqual([6, 3, 1, 5, 7, 2, 4])
  })

  it('frames every piece of a route', () => {
    expect(osmRouteBbox(route(1, { lines: [[A, B], [D, E]] }))).toEqual([A[0], A[1], E[0], B[1]])
  })

  it('tells whether an area is inside another', () => {
    expect(bboxContains([2.58, 48.38, 2.72, 48.46], [2.6, 48.4, 2.7, 48.45])).toBe(true)
    expect(bboxContains([2.58, 48.38, 2.72, 48.46], [2.6, 48.4, 2.73, 48.45])).toBe(false)
  })
})
