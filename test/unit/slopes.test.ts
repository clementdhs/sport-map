import { describe, expect, it } from 'vitest'
import type { LngLat } from '#shared/utils/routes'
import { mainClimb, slopeClass, slopeGradient, slopeProfile, slopeRuns, SLOPE_CLASSES, steepestGrade } from '#shared/utils/slopes'

const METERS_PER_DEG_LAT = 111_195
// `count` points every 10 m going north.
const line = (count: number): LngLat[] => Array.from({ length: count }, (_, i) => [6.12, 45.9 + (i * 10) / METERS_PER_DEG_LAT])

describe('slopeClass', () => {
  it('classes grades by their steepness, uphill or downhill', () => {
    expect(slopeClass(2)).toBe(0)
    expect(slopeClass(-7)).toBe(1)
    expect(slopeClass(12)).toBe(2)
    expect(slopeClass(25)).toBe(3)
  })
})

describe('slopeProfile', () => {
  it('measures the grade of a steady climb', () => {
    // 1 km at 8 %
    const coordinates = line(101)
    const { grades } = slopeProfile(coordinates, coordinates.map((_, i) => 500 + i * 0.8))
    expect(grades[50]).toBeCloseTo(8, 0)
  })

  it('measures over 100 m even where points are far apart', () => {
    // Real case (km 31 of a route): a 51 m step between points 46 m apart, the next one 18 m further.
    const steps = [0, 41, 32, 46, 18, 64, 38, 60, 60]
    const elevations = [1068.9, 1071.2, 1076.2, 1127, 1130.1, 1135.5, 1136, 1136, 1136]
    let meters = 0
    const coordinates = steps.map((step): LngLat => {
      meters += step
      return [6.12, 45.9 + meters / METERS_PER_DEG_LAT]
    })
    // Measured between the two points 18 m apart, it read 95 %.
    expect(steepestGrade(slopeProfile(coordinates, elevations))).toBeLessThan(60)
  })

  it('smooths out spikes of the elevation model', () => {
    const coordinates = line(101)
    const elevations = coordinates.map((_, i) => (i === 50 ? 530 : 500))
    // A raw 30 m spike over 10 m would read as 300 %.
    expect(steepestGrade(slopeProfile(coordinates, elevations))).toBeLessThan(15)
  })
})

describe('slopeRuns and slopeGradient', () => {
  // Flat for 500 m, then 500 m at 12 %.
  const coordinates = line(101)
  const elevations = coordinates.map((_, i) => (i <= 50 ? 500 : 500 + (i - 50) * 1.2))
  const profile = slopeProfile(coordinates, elevations)

  it('groups the track into stretches of one slope class', () => {
    const runs = slopeRuns(profile)
    expect(runs[0]!.slopeClass).toBe(0)
    // The middle of the climb; its last 50 m read a bit flatter, the smoothing window being cut there.
    expect(runs.find(run => run.startM <= 750 && run.endM >= 750)!.slopeClass).toBe(2)
    expect(runs.at(-1)!.endM).toBeCloseTo(1000, -1)
    runs.slice(1).forEach((run, i) => expect(run.startM).toBe(runs[i]!.endM))
  })

  it('builds a MapLibre step expression over the line progress', () => {
    const expression = slopeGradient(slopeRuns(profile), 1000)
    expect(expression.slice(0, 3)).toEqual(['step', ['line-progress'], SLOPE_CLASSES[0].color])
    const stops = expression.slice(3).filter((_, i) => i % 2 === 0) as number[]
    expect(stops.length).toBeGreaterThan(0)
    stops.forEach((stop, i) => expect(stop).toBeGreaterThan(i ? stops[i - 1]! : 0))
    expect(expression).toContain(SLOPE_CLASSES[2].color)
  })
})

describe('mainClimb', () => {
  it('finds the climb with the largest gain, through small dips', () => {
    // 300 m up, a 10 m dip, 300 m up again, then a long descent, then a small 40 m climb.
    const coordinates = line(201)
    const elevations = coordinates.map((_, i) => {
      if (i <= 50) return 500 + i * 6 // +300 m
      if (i <= 60) return 800 - (i - 50) // -10 m
      if (i <= 110) return 790 + (i - 60) * 6 // +300 m
      if (i <= 170) return 1090 - (i - 110) * 10 // -600 m
      return 490 + (i - 170) * 1.3 // +40 m
    })
    const { along } = slopeProfile(coordinates, elevations)
    const climb = mainClimb(coordinates, elevations, along)!
    expect(climb.gainM).toBeGreaterThan(540)
    expect(climb.startM).toBeLessThan(100)
    expect(climb.endM).toBeGreaterThan(1000)
    expect(climb.averageGrade).toBeCloseTo((climb.gainM / (climb.endM - climb.startM)) * 100, 5)
  })

  it('reports no climb on flat routes', () => {
    const coordinates = line(101)
    expect(mainClimb(coordinates, coordinates.map(() => 500), slopeProfile(coordinates, coordinates.map(() => 500)).along)).toBeNull()
  })
})
