import { describe, expect, it } from 'vitest'
import {
  elevationStats,
  estimateDurationMin,
  routeCreateSchema,
  routeSearchSchema,
  reviewSchema,
  outingSchema,
  recordingSchema,
  snapToTrack,
  MAX_POIS,
  type LngLat,
} from '#shared/utils/routes'
import { formatDuration } from '#shared/utils/format'

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
  const bounds = { minLng: '5', minLat: '45', maxLng: '7', maxLat: '47' }

  it('reads numbers from query strings and sorts by proximity by default', () => {
    const query = routeSearchSchema.parse({ ...bounds, sport: 'hiking', maxKm: '20', minGain: '300' })
    expect(query).toEqual({ minLng: 5, minLat: 45, maxLng: 7, maxLat: 47, sport: 'hiking', maxKm: 20, minGain: 300, sort: 'nearest' })
  })

  it('reads the loop filter as a real boolean', () => {
    expect(routeSearchSchema.parse({ ...bounds, loops: 'true' }).loops).toBe(true)
    expect(routeSearchSchema.parse({ ...bounds, loops: 'false' }).loops).toBe(false)
  })

  it('reads the "passing through" option as a real boolean', () => {
    expect(routeSearchSchema.parse({ ...bounds, through: 'true' }).through).toBe(true)
    expect(routeSearchSchema.parse({ ...bounds, through: 'false' }).through).toBe(false)
    expect(routeSearchSchema.parse(bounds).through).toBeUndefined()
  })

  it('rejects an unknown sort', () => {
    expect(routeSearchSchema.safeParse({ ...bounds, sort: 'random' }).success).toBe(false)
  })

  it('rejects an unknown sport', () => {
    expect(routeSearchSchema.safeParse({ minLng: 5, minLat: 45, maxLng: 7, maxLat: 47, sport: 'swimming' }).success).toBe(false)
  })

  it('trims the text to search and limits its length', () => {
    expect(routeSearchSchema.parse({ ...bounds, q: '  lac d\'Annecy ' }).q).toBe('lac d\'Annecy')
    expect(routeSearchSchema.parse(bounds).q).toBeUndefined()
    expect(routeSearchSchema.safeParse({ ...bounds, q: 'a'.repeat(101) }).success).toBe(false)
  })
})

describe('points of interest', () => {
  const route = {
    name: 'Tour du lac',
    sport_type: 'running',
    is_public: true,
    coordinates: [[6.1, 45.9], [6.2, 45.95]],
  }
  const poi = { type: 'water', coordinates: [6.15, 45.925] }

  it('are optional and validated', () => {
    expect(routeCreateSchema.safeParse(route).success).toBe(true)
    expect(routeCreateSchema.safeParse({ ...route, pois: [{ ...poi, note: 'Fontaine' }] }).success).toBe(true)
    expect(routeCreateSchema.safeParse({ ...route, pois: [{ ...poi, type: 'bar' }] }).success).toBe(false)
    expect(routeCreateSchema.safeParse({ ...route, pois: [{ ...poi, note: 'x'.repeat(141) }] }).success).toBe(false)
    expect(routeCreateSchema.safeParse({ ...route, pois: Array(MAX_POIS + 1).fill(poi) }).success).toBe(false)
  })

  it('snap onto the track and tell how far along it they are', () => {
    const track = lineNorth(101) // 1 km going north
    const { coordinates, distanceM } = snapToTrack(track, [6.121, track[50]![1]])
    expect(coordinates[0]).toBe(6.12)
    expect(coordinates[1]).toBeCloseTo(track[50]![1], 6)
    // lineNorth's spacing is approximate: within a few meters.
    expect(Math.abs(distanceM - 500)).toBeLessThan(5)
  })
})

describe('reviewSchema', () => {
  it('needs a whole rating from 1 to 5, the comment is optional', () => {
    expect(reviewSchema.safeParse({ rating: 4 }).success).toBe(true)
    expect(reviewSchema.parse({ rating: 5, comment: '  Superbe  ' }).comment).toBe('Superbe')
    for (const rating of [0, 6, 3.5]) expect(reviewSchema.safeParse({ rating }).success).toBe(false)
    expect(reviewSchema.safeParse({ rating: 3, comment: 'x'.repeat(1001) }).success).toBe(false)
  })
})

describe('search sorts', () => {
  it('accepts the best rated sort', () => {
    expect(routeSearchSchema.parse({ minLng: '5', minLat: '45', maxLng: '7', maxLat: '47', sort: 'best_rated' }).sort).toBe('best_rated')
  })
})

describe('recordingSchema', () => {
  const recording = {
    route: { name: 'Sortie', sport_type: 'hiking', is_public: false, source: 'recorded', coordinates: [[6.1, 45.9], [6.2, 45.95]] },
    started_at: '2026-09-28T08:00:00.000Z',
    duration_s: 3600,
    moving_s: 3000,
  }

  it('accepts a recorded outing', () => {
    expect(recordingSchema.parse(recording).route.source).toBe('recorded')
  })

  it('rejects more moving time than elapsed time, or a missing start', () => {
    expect(recordingSchema.safeParse({ ...recording, moving_s: 4000 }).success).toBe(false)
    expect(recordingSchema.safeParse({ ...recording, started_at: 'hier' }).success).toBe(false)
  })

  it('takes the GPS distance when the page sends it', () => {
    expect(recordingSchema.parse({ ...recording, distance_m: 9800 }).distance_m).toBe(9800)
  })
})

describe('outingSchema', () => {
  const outing = { started_at: '2026-09-28T08:00:00.000Z', duration_s: 3600, moving_s: 3000, distance_m: 9800 }

  it('accepts an outing recorded on a route', () => {
    expect(outingSchema.parse(outing)).toEqual(outing)
  })

  it('needs the distance, and no more moving time than elapsed time', () => {
    const { distance_m: _distance, ...withoutDistance } = outing
    expect(outingSchema.safeParse(withoutDistance).success).toBe(false)
    expect(outingSchema.safeParse({ ...outing, distance_m: -1 }).success).toBe(false)
    expect(outingSchema.safeParse({ ...outing, moving_s: 4000 }).success).toBe(false)
  })
})
