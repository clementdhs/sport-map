import { distance } from '@turf/turf'
import { describe, expect, it } from 'vitest'
import {
  arrivalAfter, locateOnLine, locateOnLines, measureLine, pointAlong, sectionCoordinates, sectionLength,
} from '#shared/utils/lineSection'
import { type OverpassRelation, toOsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'
import fontainebleau from '../fixtures/overpass-fontainebleau.json'

// Eastwards, about 738 m between points.
const A: LngLat = [2.6, 48.4]
const B: LngLat = [2.61, 48.4]
const C: LngLat = [2.62, 48.4]
const D: LngLat = [2.63, 48.4]
const open = measureLine([A, B, C, D])
const segment = open.along[1]!

// A square, back to its first point.
const loop = measureLine([A, B, [2.61, 48.41], [2.6, 48.41], A])

const meters = (a: LngLat, b: LngLat) => distance(a, b, { units: 'meters' })

describe('measureLine', () => {
  it('measures each point from the start', () => {
    expect(open.along).toHaveLength(4)
    expect(segment).toBeCloseTo(738, 0)
    expect(open.length).toBeCloseTo(3 * segment, 6)
    expect(open.closed).toBe(false)
    expect(open.gap).toBe(0)
  })

  it('takes a line whose ends meet for a loop, crossing the small gap left between them', () => {
    expect(loop.closed).toBe(true)
    expect(loop.gap).toBe(0)
    const nearly = measureLine([A, B, [2.61, 48.41], [2.6, 48.41], [2.6, 48.4002]])
    expect(nearly.closed).toBe(true)
    expect(nearly.gap).toBeCloseTo(22, 0)
  })
})

describe('pointAlong', () => {
  it('places the point on the segment holding it', () => {
    expect(pointAlong(open, 0)).toEqual(A)
    expect(pointAlong(open, segment)).toEqual(B)
    expect(pointAlong(open, segment * 1.5)).toEqual([2.615, 48.4])
    expect(pointAlong(open, open.length)).toEqual(D)
  })
})

describe('sectionCoordinates', () => {
  it('keeps the line\'s points between the two ends, placed on it', () => {
    expect(sectionCoordinates(open, segment / 2, segment * 2.5)).toEqual([[2.605, 48.4], B, C, [2.625, 48.4]])
    expect(sectionLength(open, segment / 2, segment * 2.5)).toBeCloseTo(2 * segment, 6)
  })

  it('doesn\'t repeat a point when an end falls on one', () => {
    expect(sectionCoordinates(open, segment, 2 * segment)).toEqual([B, C])
    expect(sectionCoordinates(open, 0, open.length)).toEqual([A, B, C, D])
  })

  it('walks an open line backwards when the arrival comes before the departure', () => {
    expect(sectionCoordinates(open, segment * 2.5, segment / 2)).toEqual([[2.625, 48.4], C, B, [2.605, 48.4]])
    expect(sectionLength(open, segment * 2.5, segment / 2)).toBeCloseTo(2 * segment, 6)
  })

  it('runs past the end of a loop and on from its start', () => {
    const from = loop.along[3]! + 100
    const to = loop.along[1]! / 2
    expect(sectionCoordinates(loop, from, to)).toEqual([pointAlong(loop, from), A, [2.605, 48.4]])
    expect(sectionLength(loop, from, to)).toBeCloseTo(loop.length - from + to, 6)
  })

  it('crosses the gap between the ends of a loop that doesn\'t quite close', () => {
    const nearly = measureLine([A, B, [2.61, 48.41], [2.6, 48.41], [2.6, 48.4002]])
    expect(sectionCoordinates(nearly, nearly.length - 10, 10)).toEqual([pointAlong(nearly, nearly.length - 10), [2.6, 48.4002], A, pointAlong(nearly, 10)])
    expect(sectionLength(nearly, nearly.length - 10, 10)).toBeCloseTo(20 + nearly.gap, 6)
  })

  it('follows exactly a real marked route between the two ends', () => {
    const relation = (fontainebleau.elements as OverpassRelation[]).find(element => element.id === 389996)!
    const line = measureLine(toOsmRoute(relation)!.lines[0]!)
    const section = sectionCoordinates(line, 1000, 2500)
    expect(section.length).toBeGreaterThan(10)
    for (const point of section) expect(locateOnLine(line, point).offset).toBeLessThan(0.2)
    expect(locateOnLine(line, section[0]!).along).toBeCloseTo(1000, 0)
    expect(locateOnLine(line, section.at(-1)!).along).toBeCloseTo(2500, 0)
    const walked = section.slice(1).reduce((sum, point, i) => sum + meters(section[i]!, point), 0)
    expect(walked).toBeCloseTo(1500, 0)
  })
})

describe('arrivalAfter', () => {
  it('goes forwards, stopping at the end of an open line', () => {
    expect(arrivalAfter(open, 100, open.length, 500)).toBe(600)
    expect(arrivalAfter(open, 100, open.length, 10_000)).toBe(open.length)
  })

  it('goes backwards on a section walked backwards, stopping at the start', () => {
    expect(arrivalAfter(open, 1000, 200, 500)).toBe(500)
    expect(arrivalAfter(open, 1000, 200, 10_000)).toBe(0)
  })

  it('goes on from the start of a loop, short of the departure', () => {
    expect(arrivalAfter(loop, loop.length - 100, loop.length, 300)).toBeCloseTo(200, 6)
    expect(arrivalAfter(loop, 1000, loop.length, 10_000)).toBe(999)
    expect(arrivalAfter(loop, 0, 500, 10_000)).toBe(loop.length)
  })
})

describe('locateOnLine', () => {
  it('finds the nearest point of the line and how far from it the point lies', () => {
    const position = locateOnLine(open, [2.615, 48.4005])
    expect(position.along).toBeCloseTo(segment * 1.5, 0)
    expect(position.offset).toBeCloseTo(meters([2.615, 48.4005], [2.615, 48.4]), 0)
  })

  it('stops at the ends', () => {
    expect(locateOnLine(open, [2.59, 48.4]).along).toBe(0)
    expect(locateOnLine(open, [2.64, 48.4]).along).toBe(open.length)
  })

  it('picks the nearest of a route\'s lines', () => {
    const north = measureLine([[2.6, 48.42], [2.63, 48.42]])
    expect(locateOnLines([open, north], [2.61, 48.418])).toMatchObject({ line: 1 })
    expect(locateOnLines([open, north], [2.61, 48.401])).toMatchObject({ line: 0 })
  })
})
