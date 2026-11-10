import { distance } from '@turf/turf'
import { describe, expect, it } from 'vitest'
import { pointFromWkb, sampleStraightLine, toLineStringEwkt } from '../../server/utils/geo'

describe('toLineStringEwkt', () => {
  it('writes lng lat pairs with the WGS84 SRID', () => {
    expect(toLineStringEwkt([[6.1, 45.9], [6.2, 46]])).toBe('SRID=4326;LINESTRING(6.1 45.9,6.2 46)')
  })
})

describe('sampleStraightLine', () => {
  it('samples about every 50 m, keeping both ends', () => {
    const from: [number, number] = [6.1, 45.9]
    const to: [number, number] = [6.1, 45.909] // ~1 km north
    const points = sampleStraightLine(from, to)
    expect(points[0]).toEqual(from)
    expect(points.at(-1)).toEqual(to)
    expect(points).toHaveLength(Math.ceil(distance(from, to, { units: 'meters' }) / 50) + 1)
  })

  it('caps the number of samples on long lines', () => {
    expect(sampleStraightLine([2, 46], [7, 46])).toHaveLength(201)
  })

  it('keeps 2 points on very short lines', () => {
    expect(sampleStraightLine([6.1, 45.9], [6.1, 45.9001])).toHaveLength(2)
  })
})

describe('pointFromWkb', () => {
  it('reads a point as PostgREST returns a geography column', () => {
    expect(pointFromWkb('0101000020E6100000A835CD3B4ED1024076E09C11A56D4840')).toEqual([2.3522, 48.8566])
    // Plain WKB, big-endian
    expect(pointFromWkb('00000000014016cccccccccccd40468ccccccccccd')).toEqual([5.7, 45.1])
  })

  it('returns null for anything else', () => {
    expect(pointFromWkb(null)).toBeNull()
    expect(pointFromWkb('not hex')).toBeNull()
    // A linestring
    expect(pointFromWkb('0102000020E61000000000000000')).toBeNull()
  })
})
