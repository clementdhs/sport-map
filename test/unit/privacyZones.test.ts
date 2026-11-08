import { distance } from '@turf/turf'
import { describe, expect, it } from 'vitest'
import {
  insideZones, maskOutingTrack, maskRouteTrack, maskWayInfo, offsetCenter, PRIVACY_OFFSET_SHARE, privacyZoneSchema,
  segmentInCircle, trackMask, type MaskCircle,
} from '#shared/utils/privacyZones'
import type { LngLat, OutingTrackPoint, WayInfo } from '#shared/utils/routes'

const HOME: LngLat = [5.7245, 45.1885]
const ZONE: MaskCircle = { center: HOME, radiusM: 200 }

// About `metres` east of the home (1° of longitude is ~78.5 km at this latitude).
function east(metres: number, north = 0): LngLat {
  return [HOME[0] + metres / 78_500, HOME[1] + north / 111_195]
}

function metresFromHome(point: LngLat): number {
  return distance(point, HOME, { units: 'meters' })
}

// Out and back from the home, a point every 100 m up to 1 km.
const OUT = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map(m => east(m))
const LOOP = [...OUT, ...OUT.slice(0, -1).reverse().map(([lng, lat]): LngLat => [lng, lat + 0.00045])]

describe('segmentInCircle', () => {
  it('gives the part of a segment inside the circle', () => {
    const [from, to] = segmentInCircle(east(-1000), east(1000), ZONE)!
    expect(from).toBeCloseTo(0.4, 2)
    expect(to).toBeCloseTo(0.6, 2)
  })

  it('is null for a segment that misses the circle', () => {
    expect(segmentInCircle(east(300), east(1000), ZONE)).toBeNull()
    expect(segmentInCircle(east(-1000, 500), east(1000, 500), ZONE)).toBeNull()
  })
})

describe('trackMask', () => {
  it('leaves tracks alone without zones, or away from them', () => {
    expect(trackMask(OUT, [])).toEqual({ kind: 'visible' })
    expect(trackMask(OUT.slice(4), [ZONE])).toEqual({ kind: 'visible' })
  })

  it('hides a track that stays in the zones', () => {
    expect(trackMask([east(0), east(50), east(-80)], [ZONE])).toEqual({ kind: 'hidden' })
  })

  it('starts the track where it leaves the zone, on its edge', () => {
    const mask = trackMask(OUT, [ZONE])
    expect(mask).toMatchObject({ kind: 'trimmed', first: 3, last: 10, to: null })
    const masked = maskRouteTrack({ coordinates: OUT, elevations: null, pois: [], way_info: null, editor_state: null }, [ZONE])
    expect(masked.kind).toBe('trimmed')
    if (masked.kind !== 'trimmed') return
    expect(masked.track.coordinates).toHaveLength(9)
    expect(metresFromHome(masked.track.coordinates[0]!)).toBeCloseTo(200, -1)
    expect(masked.track.coordinates.slice(1)).toEqual(OUT.slice(3))
  })

  it('cuts both ends of a loop from home', () => {
    const mask = trackMask(LOOP, [ZONE])
    expect(mask).toMatchObject({ kind: 'trimmed', first: 3, last: LOOP.length - 3 })
    const masked = maskRouteTrack({ coordinates: LOOP, elevations: null, pois: [], way_info: null, editor_state: null }, [ZONE])
    if (masked.kind !== 'trimmed') throw new Error('not trimmed')
    const { coordinates } = masked.track
    expect(metresFromHome(coordinates[0]!)).toBeCloseTo(200, -1)
    expect(metresFromHome(coordinates.at(-1)!)).toBeCloseTo(200, -1)
    expect(coordinates.every(point => metresFromHome(point) >= 199)).toBe(true)
  })

  it('cuts a long straight segment on the circle', () => {
    const masked = maskRouteTrack({ coordinates: [east(0), east(5000)], elevations: [200, 700], pois: [], way_info: null, editor_state: null }, [ZONE])
    if (masked.kind !== 'trimmed') throw new Error('not trimmed')
    expect(metresFromHome(masked.track.coordinates[0]!)).toBeCloseTo(200, -1)
    // Elevations follow, interpolated at the cut.
    expect(masked.track.elevations![0]).toBeCloseTo(220, 0)
    expect(masked.track.elevations![1]).toBe(700)
  })

  it('keeps passages through a zone in the middle of a track', () => {
    const through = [east(-1000), east(-100), east(0), east(100), east(1000)]
    expect(trackMask(through, [ZONE])).toEqual({ kind: 'visible' })
  })

  it('leaves overlapping zones as one', () => {
    const work: MaskCircle = { center: east(300), radiusM: 200 }
    const masked = maskRouteTrack({ coordinates: OUT, elevations: null, pois: [], way_info: null, editor_state: null }, [ZONE, work])
    if (masked.kind !== 'trimmed') throw new Error('not trimmed')
    expect(metresFromHome(masked.track.coordinates[0]!)).toBeCloseTo(500, -1)
    expect(masked.track.coordinates.slice(1)).toEqual(OUT.slice(6))
  })
})

describe('maskRouteTrack', () => {
  const elevations = OUT.map((_, i) => 200 + i * 10)

  it('drops the steps in a zone and the editor state', () => {
    const masked = maskRouteTrack({
      coordinates: OUT,
      elevations,
      pois: [{ type: 'parking', coordinates: east(50) }, { type: 'water', coordinates: east(600) }],
      way_info: null,
      editor_state: { waypoints: [OUT[0]!, OUT[10]!], segments: [{ mode: 'snap', start: 0, end: 10 }] },
    }, [ZONE])
    if (masked.kind !== 'trimmed') throw new Error('not trimmed')
    expect(masked.track.pois).toEqual([{ type: 'water', coordinates: east(600) }])
    expect(masked.track.editor_state).toBeNull()
    expect(masked.track.elevations).toHaveLength(masked.track.coordinates.length)
    expect(masked.track.elevations!.slice(1)).toEqual(elevations.slice(3))
  })

  it('leaves an untouched route as it is', () => {
    expect(maskRouteTrack({ coordinates: OUT.slice(4), elevations: null, pois: [], way_info: null, editor_state: null }, [ZONE]))
      .toEqual({ kind: 'visible' })
  })
})

describe('maskWayInfo', () => {
  const wayInfo: WayInfo = { surface: [[0, 2, 1], [2, 6, 3], [6, 10, 4]], waytype: [[0, 10, 2]], sac_scale: [], mtb_scale: [] }

  it('moves the ranges onto the visible points', () => {
    // first = 3 after a cut on the segment 2 → 3: new index 0 is the cut, 1 is old point 3.
    const masked = maskWayInfo(wayInfo, { kind: 'trimmed', first: 3, last: 8, from: 0.5, to: 0.5 })
    // 8 points: the cut, old 3 to 8, the cut.
    expect(masked.surface).toEqual([[0, 4, 3], [4, 7, 4]])
    expect(masked.waytype).toEqual([[0, 7, 2]])
  })

  it('empties them for a hidden track', () => {
    expect(maskWayInfo(wayInfo, { kind: 'hidden' }).surface).toEqual([])
  })
})

describe('maskOutingTrack', () => {
  it('cuts GPS points and interpolates their times', () => {
    const track: OutingTrackPoint[] = OUT.map(([lng, lat], i) => [lng, lat, i === 2 ? null : 200, i * 30, i * 30])
    const masked = maskOutingTrack(track, [ZONE])
    if (masked.kind !== 'trimmed') throw new Error('not trimmed')
    const [lng, lat, altitude, elapsed] = masked.track[0]!
    expect(metresFromHome([lng, lat])).toBeCloseTo(200, -1)
    // Between point 2 (no altitude) and 3.
    expect(altitude).toBeNull()
    expect(elapsed).toBeGreaterThan(60)
    expect(elapsed).toBeLessThan(90)
    expect(masked.track.slice(1)).toEqual(track.slice(3))
  })
})

describe('offsetCenter', () => {
  it('moves the centre by at most the offset share of the radius', () => {
    for (const [a, b] of [[0, 0], [0.999, 0.25], [0.5, 0.75], [1 - 1e-9, 0]]) {
      const values = [a!, b!]
      const moved = offsetCenter(HOME, 500, () => values.shift()!)
      expect(metresFromHome(moved)).toBeLessThanOrEqual(PRIVACY_OFFSET_SHARE * 500 + 1)
    }
    const values = [1 - 1e-9, 0]
    expect(metresFromHome(offsetCenter(HOME, 500, () => values.shift()!))).toBeCloseTo(200, -1)
  })

  it('keeps the place well inside the moved circle', () => {
    const values = [0.99, 0.6]
    const center = offsetCenter(HOME, 200, () => values.shift()!)
    expect(insideZones(HOME, [{ center, radiusM: 200 * (1 - PRIVACY_OFFSET_SHARE) }])).toBe(true)
  })
})

describe('privacyZoneSchema', () => {
  it('only takes the offered radii', () => {
    expect(privacyZoneSchema.safeParse({ center: HOME, radius_m: 500 }).success).toBe(true)
    expect(privacyZoneSchema.safeParse({ center: HOME, radius_m: 50 }).success).toBe(false)
  })
})
