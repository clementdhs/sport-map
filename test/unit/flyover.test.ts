import { describe, expect, it } from 'vitest'
import type { LngLat, OutingTrackPoint } from '#shared/utils/routes'
import {
  flyoverAlong,
  flyoverDurationS,
  flyoverHeading,
  flyoverPoint,
  flyoverProgress,
  flyoverTime,
  flyoverZoom,
  outingFlyover,
  profileSamples,
  routeFlyover,
  smoothBearing,
} from '~/utils/flyover'

const METERS_PER_DEG_LAT = 111_195

// Northwards, a point every `stepM` metres.
function north(totalM: number, stepM = 100): LngLat[] {
  const points: LngLat[] = []
  for (let m = 0; m <= totalM; m += stepM) points.push([6.12, 45.9 + m / METERS_PER_DEG_LAT])
  return points
}

describe('flyoverDurationS', () => {
  it('lasts 30 s up to 10 km, then longer, at most 60 s', () => {
    expect(flyoverDurationS(2_000)).toBe(30)
    expect(flyoverDurationS(10_000)).toBe(30)
    expect(flyoverDurationS(30_000)).toBe(45)
    expect(flyoverDurationS(50_000)).toBe(60)
    expect(flyoverDurationS(200_000)).toBe(60)
  })
})

describe('flyoverZoom', () => {
  it('moves further away when the ground goes by faster', () => {
    const slow = flyoverZoom(600, 45)
    const fast = flyoverZoom(2_400, 45)
    expect(fast).toBeCloseTo(slow - 2, 5)
  })

  it('stays between zoom 12 and 15', () => {
    expect(flyoverZoom(1, 45)).toBe(15)
    expect(flyoverZoom(1_000_000, 45)).toBe(12)
  })

  it('keeps about 200 px/s on screen for a 30 km route at the base duration', () => {
    const zoom = flyoverZoom(30_000 / flyoverDurationS(30_000), 45.9)
    const metersPerPixel = (40_075_016.686 * Math.cos((45.9 * Math.PI) / 180)) / (512 * 2 ** zoom)
    expect((30_000 / 45) / metersPerPixel).toBeCloseTo(200, 0)
  })
})

describe('route flyover', () => {
  const track = routeFlyover(north(1_000))

  it('goes at a steady pace', () => {
    expect(flyoverAlong(track, 0)).toBe(0)
    expect(flyoverAlong(track, 0.25)).toBeCloseTo(250, 0)
    expect(flyoverAlong(track, 1)).toBeCloseTo(1_000, 0)
    expect(flyoverAlong(track, 2)).toBeCloseTo(1_000, 0)
  })

  it('finds the progress of a point along the line', () => {
    expect(flyoverProgress(track, 500)).toBeCloseTo(0.5, 3)
    expect(flyoverProgress(track, flyoverAlong(track, 0.8))).toBeCloseTo(0.8, 6)
  })

  it('places the moving point on the line', () => {
    const [lng, lat] = flyoverPoint(track, 250)
    expect(lng).toBeCloseTo(6.12, 6)
    expect((lat - 45.9) * METERS_PER_DEG_LAT).toBeCloseTo(250, 0)
    expect(flyoverPoint(track, -10)).toEqual(track.line.coordinates[0])
  })

  it('keeps elevations only when there is one per point', () => {
    const points = north(300)
    expect(routeFlyover(points, [1, 2, 3, 4]).elevations).toEqual([1, 2, 3, 4])
    expect(routeFlyover(points, [1, 2]).elevations).toBeNull()
    expect(routeFlyover(points).elevations).toBeNull()
  })
})

describe('outing flyover', () => {
  // 1 km northwards: the first 500 m in 100 s, a 10 min pause (moving time frozen), the last 500 m in 400 s.
  const outing: OutingTrackPoint[] = north(1_000).map(([lng, lat], i): OutingTrackPoint => {
    const m = i * 100
    const movingS = m <= 500 ? m / 5 : 100 + (m - 500) * 0.8
    const elapsedS = m <= 500 ? movingS : movingS + 600
    return [lng, lat, 200 + m / 10, elapsedS, movingS]
  })

  it('replays the outing at its own moving pace', () => {
    const track = outingFlyover(outing)
    // A sixth of the moving time (500 s) covers the fast first half.
    expect(flyoverAlong(track, 0.2)).toBeCloseTo(500, 0)
    expect(flyoverAlong(track, 0.6)).toBeCloseTo(750, 0)
    expect(flyoverTime(track, 0.6)).toBeCloseTo(300, 6)
    expect(flyoverProgress(track, 750)).toBeCloseTo(0.6, 3)
  })

  it('smooths the GPS altitudes, and has none when one is missing', () => {
    expect(outingFlyover(outing).elevations).toHaveLength(outing.length)
    const withHole = outing.map((point, i): OutingTrackPoint => (i === 3 ? [point[0], point[1], null, point[3], point[4]] : point))
    expect(outingFlyover(withHole).elevations).toBeNull()
  })

  it('goes at a steady pace when no moving time was kept', () => {
    const track = outingFlyover(outing.map(([lng, lat, alt]): OutingTrackPoint => [lng, lat, alt, 0, 0]))
    expect(flyoverAlong(track, 0.5)).toBeCloseTo(500, 0)
  })
})

describe('flyoverHeading', () => {
  it('points the direction of travel', () => {
    expect(flyoverHeading(routeFlyover(north(1_000)), 500, 100)).toBeCloseTo(0, 3)
    const eastwards = north(1_000).map(([lng, lat]): LngLat => [lng + (lat - 45.9) * 1.4, 45.9])
    expect(flyoverHeading(routeFlyover(eastwards), 500, 100)).toBeCloseTo(90, 0)
  })

  it('ignores a bend shorter than its span', () => {
    // 1 km north with a 100 m detour eastwards and back in the middle.
    const points = north(1_000)
    points.splice(5, 0, [6.12 + 0.0013, points[5]![1]])
    const track = routeFlyover(points)
    expect(Math.abs(flyoverHeading(track, 550, 300)!)).toBeLessThan(20)
  })

  it('has none on a line that stays in place', () => {
    expect(flyoverHeading(routeFlyover([[6, 45], [6, 45]]), 0, 100)).toBeNull()
  })
})

describe('smoothBearing', () => {
  it('turns part of the way, more when more time passed', () => {
    const short = smoothBearing(0, 90, 0.1, 1)
    const long = smoothBearing(0, 90, 1, 1)
    expect(short).toBeGreaterThan(0)
    expect(long).toBeGreaterThan(short)
    expect(long).toBeCloseTo(90 * (1 - Math.exp(-1)), 6)
  })

  it('turns the short way round', () => {
    expect(smoothBearing(170, -170, 20, 1)).toBeCloseTo(-170, 3)
    const halfway = smoothBearing(170, -170, Math.LN2, 1)
    expect(Math.abs(halfway)).toBeCloseTo(180, 3)
  })
})

describe('profileSamples', () => {
  it('keeps at most `count` points, from the start to the end', () => {
    const points = north(10_000, 10)
    const track = routeFlyover(points, points.map((_, i) => i))
    const samples = profileSamples(track, 300)
    expect(samples.length).toBeLessThanOrEqual(301)
    expect(samples[0]).toEqual([0, 0])
    expect(samples.at(-1)![0]).toBeCloseTo(track.line.length, 6)
    expect(samples.at(-1)![1]).toBe(points.length - 1)
  })

  it('has none without elevations', () => {
    expect(profileSamples(routeFlyover(north(1_000)))).toEqual([])
  })
})
