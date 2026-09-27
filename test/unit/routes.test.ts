import { describe, expect, it } from 'vitest'
import {
  elevationStats,
  estimateDurationMin,
  routeCreateSchema,
  routeSearchSchema,
  type LngLat,
} from '#shared/utils/routes'
import { formatDuration } from '~/utils/format'

// Points every `spacingM` meters going north, from Annecy.
function lineNorth(count: number, spacingM = 10): LngLat[] {
  const degreesPerMeter = 1 / 111_320
  return Array.from({ length: count }, (_, i) => [6.12, 45.9 + i * spacingM * degreesPerMeter])
}

describe('estimateDurationMin', () => {
  // Values checked by hand when the feature was built (issue #4).
  it.each([
    ['hiking', 43_930, 1528, '11 h 20'],
    ['running', 49_370, null, '4 h 55'],
    ['running', 268_540, 1798, '28 h 40'],
    ['cycling', 268_540, 1798, '16 h 25'],
  ] as const)('%s, %i m, %s m of gain → ~%s', (sport, distanceM, gainM, expected) => {
    expect(formatDuration(estimateDurationMin(sport, distanceM, gainM))).toBe(expected)
  })

  it('ignores an unknown elevation gain', () => {
    expect(estimateDurationMin('hiking', 10_000, null)).toBe(estimateDurationMin('hiking', 10_000, 0))
  })

  it('makes climbing cost time', () => {
    expect(estimateDurationMin('cycling', 10_000, 600) - estimateDurationMin('cycling', 10_000, 0)).toBeCloseTo(60)
  })
})

describe('elevationStats', () => {
  it('finds no gain on flat ground', () => {
    const coordinates = lineNorth(100)
    expect(elevationStats(coordinates, coordinates.map(() => 500))).toEqual({ gain: 0, loss: 0 })
  })

  it('ignores small up-and-down noise', () => {
    const coordinates = lineNorth(100)
    const elevations = coordinates.map((_, i) => 500 + (i % 2 ? 2 : -2))
    expect(elevationStats(coordinates, elevations)).toEqual({ gain: 0, loss: 0 })
  })

  it('measures a steady climb', () => {
    const coordinates = lineNorth(101) // 1 km
    const elevations = coordinates.map((_, i) => i) // 0 → 100 m
    const { gain, loss } = elevationStats(coordinates, elevations)
    // The 100 m smoothing window slightly flattens both ends.
    expect(gain).toBeGreaterThan(90)
    expect(gain).toBeLessThanOrEqual(100)
    expect(loss).toBe(0)
  })

  it('damps an isolated spike from the elevation model', () => {
    const coordinates = lineNorth(100)
    const elevations = coordinates.map((_, i) => (i === 50 ? 550 : 500))
    // Summing raw values would count 50 m up and 50 m down.
    expect(elevationStats(coordinates, elevations).gain).toBeLessThan(10)
  })
})

describe('routeCreateSchema', () => {
  const valid = {
    name: 'Tour du lac',
    sport_type: 'running',
    is_public: true,
    coordinates: [[6.1, 45.9], [6.2, 45.95], [6.3, 46]],
    elevations: [450, 500, 480],
    editor_state: {
      waypoints: [[6.1, 45.9], [6.2, 45.95], [6.3, 46]],
      segments: [{ mode: 'snap', start: 0, end: 1 }, { mode: 'straight', start: 1, end: 2 }],
    },
  }

  it('accepts a valid route and defaults its source', () => {
    const parsed = routeCreateSchema.parse(valid)
    expect(parsed.source).toBe('drawn')
  })

  it('trims the name and rejects an empty one', () => {
    expect(routeCreateSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false)
  })

  it('needs at least 2 points', () => {
    expect(routeCreateSchema.safeParse({ ...valid, coordinates: [[6.1, 45.9]], elevations: undefined, editor_state: undefined }).success).toBe(false)
  })

  it('needs one elevation per point', () => {
    expect(routeCreateSchema.safeParse({ ...valid, elevations: [450, 500] }).success).toBe(false)
  })

  it('rejects an editor state that does not match the track', () => {
    const outOfRange = { ...valid.editor_state, segments: [{ mode: 'snap', start: 0, end: 1 }, { mode: 'snap', start: 1, end: 9 }] }
    expect(routeCreateSchema.safeParse({ ...valid, editor_state: outOfRange }).success).toBe(false)

    const missingSegment = { ...valid.editor_state, segments: [{ mode: 'snap', start: 0, end: 2 }] }
    expect(routeCreateSchema.safeParse({ ...valid, editor_state: missingSegment }).success).toBe(false)
  })

  it('rejects out-of-range coordinates', () => {
    expect(routeCreateSchema.safeParse({ ...valid, coordinates: [[200, 45], [6, 46]], elevations: undefined, editor_state: undefined }).success).toBe(false)
  })
})

describe('routeSearchSchema', () => {
  it('reads numbers from query strings', () => {
    const query = routeSearchSchema.parse({ minLng: '5', minLat: '45', maxLng: '7', maxLat: '47', sport: 'hiking', maxKm: '20' })
    expect(query).toEqual({ minLng: 5, minLat: 45, maxLng: 7, maxLat: 47, sport: 'hiking', maxKm: 20 })
  })

  it('rejects an unknown sport', () => {
    expect(routeSearchSchema.safeParse({ minLng: 5, minLat: 45, maxLng: 7, maxLat: 47, sport: 'swimming' }).success).toBe(false)
  })
})
