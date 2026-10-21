import { describe, expect, it, vi } from 'vitest'
import {
  elevationSampleIndices, FALLBACK_POINTS_PER_CALL, FALLBACK_SPACING_M, fillElevations, MAX_FALLBACK_POINTS,
  trackElevationsFrom, withoutZeroElevations,
} from '#shared/utils/trackElevation'
import type { LngLat } from '#shared/utils/routes'

// Distances along a track whose points are `step` meters apart.
const evenly = (count: number, step: number) => Array.from({ length: count }, (_, i) => i * step)

describe('elevationSampleIndices', () => {
  it('asks every point of a track sparser than the spacing', () => {
    expect(elevationSampleIndices(evenly(5, 150))).toEqual([0, 1, 2, 3, 4])
  })

  it('skips points closer than the spacing, always keeping the first and the last', () => {
    // A point every 20 m over 2 km: one every 100 m, up to 1,900 m (1,960 m is too close to the end).
    const along = evenly(101, 20)
    const indices = elevationSampleIndices(along)
    expect(indices[0]).toBe(0)
    expect(indices.at(-1)).toBe(100)
    expect(indices).toHaveLength(21)
    for (let k = 1; k < indices.length - 1; k++) {
      expect(along[indices[k]!]! - along[indices[k - 1]!]!).toBeGreaterThanOrEqual(FALLBACK_SPACING_M)
    }
  })

  it('doesn\'t keep a point just before the end', () => {
    // 0, 100, 200, 300: 300 is 20 m from the end at 320.
    expect(elevationSampleIndices([0, 100, 200, 300, 320])).toEqual([0, 1, 2, 4])
  })

  it('starts again from the point after a long gap', () => {
    // Nothing between 0 and 5,000 m (a stretch in France), then a point every 50 m.
    const along = [0, ...evenly(11, 50).map(d => 5000 + d)]
    expect(elevationSampleIndices(along).map(i => along[i])).toEqual([0, 5000, 5100, 5200, 5300, 5400, 5500])
  })

  it('spaces the points further on a long stretch', () => {
    // 100 km with a point every 20 m (the editor keeps 5,000 points at most).
    const indices = elevationSampleIndices(evenly(5000, 20))
    expect(indices.length).toBeLessThanOrEqual(MAX_FALLBACK_POINTS)
    expect(indices.length).toBeGreaterThan(MAX_FALLBACK_POINTS * 0.9)
  })

  it('handles the shortest tracks', () => {
    expect(elevationSampleIndices([0, 5])).toEqual([0, 1])
    expect(elevationSampleIndices([0])).toEqual([0])
  })
})

describe('withoutZeroElevations', () => {
  // Points 0.001° of longitude apart on the equator: about 111 m between each.
  const line = (count: number): LngLat[] => Array.from({ length: count }, (_, i) => [i / 1000, 0])

  it('keeps a track without zeros as it is', () => {
    const elevations = [212.34, 230, 251.6]
    expect(withoutZeroElevations(line(3), elevations)).toBe(elevations)
  })

  it('fills isolated zeros linearly from their neighbours along the track', () => {
    expect(withoutZeroElevations(line(7), [200, 0, 240, 260, 0, 0, 290])).toEqual([200, 220, 240, 260, 270, 280, 290])
  })

  it('takes the nearest known elevation for zeros at the start or the end', () => {
    expect(withoutZeroElevations(line(5), [0, 0, 300, 320, 0])).toEqual([300, 300, 300, 320, 320])
  })

  it('keeps the zeros of a track that has no other elevation', () => {
    expect(withoutZeroElevations(line(3), [0, 0, 0])).toEqual([0, 0, 0])
  })

  it('leaves negative elevations alone', () => {
    expect(withoutZeroElevations(line(3), [-2, 0, -4])).toEqual([-2, -3, -4])
  })
})

describe('fillElevations', () => {
  it('keeps the known elevations and spreads them linearly along the track', () => {
    // Known at 0 m (100 m high), 40 m (140 m high) and 100 m (80 m high).
    expect(fillElevations([0, 10, 40, 70, 100], [100, null, 140, null, 80])).toEqual([100, 110, 140, 110, 80])
  })

  it('rounds to 10 cm', () => {
    expect(fillElevations([0, 10, 20, 30], [100, null, null, 101])).toEqual([100, 100.3, 100.7, 101])
    expect(fillElevations([0, 10], [123.456, 99.94])).toEqual([123.5, 99.9])
  })

  it('takes the nearest known elevation before the first or after the last', () => {
    expect(fillElevations([0, 10, 20, 30], [null, 50, 60, null])).toEqual([50, 50, 60, 60])
  })

  it('copes with two points at the same place', () => {
    expect(fillElevations([0, 0, 10], [5, null, 7])).toEqual([5, 5, 7])
  })
})

describe('trackElevationsFrom', () => {
  // About 1 km a step along a parallel at 46° N: 0.013° of longitude.
  const track = (count: number): LngLat[] => Array.from({ length: count }, (_, i) => [6 + i * 0.013, 46])

  it('takes every elevation from the precise source in France, without the fallback', async () => {
    const fallback = vi.fn()
    const elevations = await trackElevationsFrom(track(4), { precise: async points => points.map((_, i) => 400 + i), fallback })
    expect(elevations).toEqual([400, 401, 402, 403])
    expect(fallback).not.toHaveBeenCalled()
  })

  it('asks the fallback for the points outside France only, and spreads its answers', async () => {
    // Points 0 to 2 in France, 3 to 5 abroad (1 km apart: all asked).
    const points = track(6)
    const fallback = vi.fn(async (asked: LngLat[]) => asked.map(() => 1000))
    const elevations = await trackElevationsFrom(points, {
      precise: async all => all.map((_, i) => i < 3 ? 500 : null),
      fallback,
    })
    expect(fallback).toHaveBeenCalledWith(points.slice(3))
    expect(elevations).toEqual([500, 500, 500, 1000, 1000, 1000])
  })

  it('samples a long stretch abroad, in calls of 100 points at most', async () => {
    // 3,000 points 20 m apart (60 km), all outside France.
    const points: LngLat[] = Array.from({ length: 3000 }, (_, i) => [7 + i * 0.00026, 46])
    const calls: number[] = []
    const elevations = await trackElevationsFrom(points, {
      precise: async all => all.map(() => null),
      fallback: async (asked) => {
        calls.push(asked.length)
        return asked.map(([lng]) => Math.round((lng - 7) * 1000))
      },
    })
    expect(calls.reduce((sum, count) => sum + count, 0)).toBeLessThanOrEqual(MAX_FALLBACK_POINTS)
    expect(Math.max(...calls)).toBeLessThanOrEqual(FALLBACK_POINTS_PER_CALL)
    expect(elevations).toHaveLength(3000)
    // A steady climb stays steady once spread.
    expect(elevations[0]).toBe(0)
    expect(elevations.at(-1)).toBe(Math.round((points.at(-1)![0] - 7) * 1000))
    expect(elevations.every((elevation, i) => i === 0 || elevation >= elevations[i - 1]!)).toBe(true)
  })
})
