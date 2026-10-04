import { describe, expect, it } from 'vitest'
import type { LngLat } from '#shared/utils/routes'
import { finiteOrNull, HEADING_STALE_MS, nextHeading, NO_HEADING, type HeadingFix, type HeadingState } from '~/utils/heading'

const METERS_PER_DEG_LAT = 111_195
const T0 = Date.UTC(2026, 9, 4, 8, 0, 0)

// A position `north` and `east` meters from a point near Annecy.
const at = (north: number, east = 0): LngLat => [
  6.12 + east / (METERS_PER_DEG_LAT * Math.cos((45.9 * Math.PI) / 180)),
  45.9 + north / METERS_PER_DEG_LAT,
]
const fix = (north: number, east = 0, extra: Partial<HeadingFix> = {}): HeadingFix =>
  ({ position: at(north, east), accuracyM: 5, headingDeg: null, speedMps: null, ...extra })

// Feeds fixes one second apart, from T0.
function feed(fixes: HeadingFix[], state: HeadingState = NO_HEADING, from = T0): HeadingState {
  return fixes.reduce((s, f, i) => nextHeading(s, f, from + i * 1000), state)
}

describe('nextHeading', () => {
  it('uses the course given by the GPS while moving', () => {
    expect(feed([fix(0, 0, { headingDeg: 270, speedMps: 1.4 })]).headingDeg).toBe(270)
    expect(feed([fix(0, 0, { headingDeg: -90, speedMps: 1.4 })]).headingDeg).toBe(270)
  })

  it('ignores the GPS course of a walker standing still', () => {
    expect(feed([fix(0, 0, { headingDeg: 120, speedMps: 0.2 })]).headingDeg).toBeNull()
  })

  it('measures the direction between fixes without a GPS course', () => {
    const state = feed([fix(0), fix(4, 4), fix(8, 8)])
    expect(state.headingDeg).toBeCloseTo(45, 0)
  })

  it('waits for a few meters before measuring a direction', () => {
    expect(feed([fix(0), fix(3), fix(6)]).headingDeg).toBeNull()
    expect(feed([fix(0), fix(6), fix(12)]).headingDeg).toBeCloseTo(0, 0)
  })

  it('waits for a move larger than the accuracy', () => {
    const blurry = (north: number) => fix(north, 0, { accuracyM: 25 })
    expect(feed([blurry(0), blurry(15)]).headingDeg).toBeNull()
    expect(feed([blurry(0), blurry(30)]).headingDeg).toBeCloseTo(0, 0)
  })

  it('ignores inaccurate fixes', () => {
    expect(feed([fix(0), fix(0, 50, { accuracyM: 60 })]).headingDeg).toBeNull()
    const north = feed([fix(0), fix(20)])
    expect(nextHeading(north, fix(20, -60, { accuracyM: 60 }), T0 + 5000).headingDeg).toBeCloseTo(0, 0)
  })

  it('ignores GPS jumps', () => {
    expect(feed([fix(0), fix(0, 500)]).headingDeg).toBeNull()
  })

  it('keeps the last direction while stopped, then forgets it', () => {
    const east = feed([fix(0), fix(0, 20)])
    // Jitter around the stop, with the device saying it's still.
    const jitter = [fix(2, 20, { speedMps: 0 }), fix(-2, 22, { speedMps: 0.1 }), fix(1, 17)]
    const stopped = feed(jitter, east, T0 + 2000)
    expect(stopped.headingDeg).toBeCloseTo(90, 0)
    expect(nextHeading(stopped, fix(0, 20, { speedMps: 0 }), T0 + 1000 + HEADING_STALE_MS + 1).headingDeg).toBeNull()
  })

  it('turns with the walker', () => {
    const state = feed([fix(0), fix(15), fix(15, 15)])
    expect(state.headingDeg).toBeCloseTo(90, 0)
  })
})

describe('finiteOrNull', () => {
  it('drops missing and NaN values', () => {
    expect(finiteOrNull(NaN)).toBeNull()
    expect(finiteOrNull(null)).toBeNull()
    expect(finiteOrNull(undefined)).toBeNull()
    expect(finiteOrNull(0)).toBe(0)
  })
})
