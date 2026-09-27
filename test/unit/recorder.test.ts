import { describe, expect, it } from 'vitest'
import { MAX_ROUTE_POINTS, type LngLat } from '#shared/utils/routes'
import {
  addFix,
  elapsedMs,
  pauseRecording,
  recordingTrack,
  resumeRecording,
  startRecording,
  type Fix,
  type Recording,
} from '~/utils/recorder'

const METERS_PER_DEG_LAT = 111_195
const T0 = Date.UTC(2026, 8, 28, 8, 0, 0)

// A position `meters` north of the start, near Annecy.
const north = (meters: number): LngLat => [6.12, 45.9 + meters / METERS_PER_DEG_LAT]
const fix = (meters: number, extra: Partial<Fix> = {}): Fix => ({ position: north(meters), accuracyM: 5, altitudeM: null, ...extra })

// Walks north, one fix every `everyS` seconds, `stepM` meters apart.
function walk(recording: Recording, fromM: number, steps: number, stepM: number, everyS: number, fromT: number) {
  let r = recording
  for (let i = 1; i <= steps; i++) r = addFix(r, fix(fromM + i * stepM), fromT + i * everyS * 1000)
  return r
}

describe('addFix', () => {
  it('measures the distance and the moving time', () => {
    let r = addFix(startRecording(T0), fix(0), T0)
    r = walk(r, 0, 10, 10, 10, T0) // 100 m in 100 s
    expect(r.points).toHaveLength(11)
    expect(r.distanceM).toBeCloseTo(100, 0)
    expect(r.movingMs).toBe(100_000)
  })

  it('ignores inaccurate fixes, jitter and GPS jumps', () => {
    let r = addFix(startRecording(T0), fix(0), T0)
    r = addFix(r, fix(50, { accuracyM: 80 }), T0 + 10_000) // inaccurate
    r = addFix(r, fix(3), T0 + 20_000) // jitter
    r = addFix(r, fix(2000), T0 + 30_000) // 2 km in 30 s
    expect(r.points).toHaveLength(1)
    expect(r.distanceM).toBe(0)
  })

  it('does not count standing still as moving time', () => {
    let r = addFix(startRecording(T0), fix(0), T0)
    r = addFix(r, fix(10), T0 + 10 * 60_000) // 10 m in 10 min: a break
    expect(r.distanceM).toBeCloseTo(10, 0)
    expect(r.movingMs).toBe(0)
  })

  it('counts GPS interruptions, keeping the distance and a plausible moving time', () => {
    let r = addFix(startRecording(T0), fix(0), T0)
    r = addFix(r, fix(800), T0 + 10 * 60_000) // screen off for 10 min, 800 m walked
    expect(r.gaps).toBe(1)
    expect(r.distanceM).toBeCloseTo(800, 0)
    expect(r.movingMs).toBe(10 * 60_000)
  })

  it('records nothing while paused, and no moving time across the pause', () => {
    let r = addFix(startRecording(T0), fix(0), T0)
    r = pauseRecording(r, T0 + 60_000)
    r = addFix(r, fix(100), T0 + 120_000)
    expect(r.points).toHaveLength(1)
    r = resumeRecording(r)
    r = addFix(r, fix(100), T0 + 180_000)
    r = addFix(r, fix(110), T0 + 190_000)
    expect(r.distanceM).toBeCloseTo(110, 0)
    expect(r.movingMs).toBe(10_000)
    // The watch kept running during the pause.
    expect(elapsedMs(r, T0 + 190_000)).toBe(190_000)
  })
})

describe('recordingTrack', () => {
  it('needs at least two points', () => {
    expect(recordingTrack(addFix(startRecording(T0), fix(0), T0))).toBeNull()
  })

  it('keeps GPS altitudes only when every point has one', () => {
    let r = addFix(startRecording(T0), fix(0, { altitudeM: 450 }), T0)
    r = addFix(r, fix(20, { altitudeM: 452.46 }), T0 + 10_000)
    expect(recordingTrack(r)).toEqual({ coordinates: [north(0), [6.12, 45.90018]], elevations: [450, 452.5] })
    r = addFix(r, fix(40), T0 + 20_000)
    expect(recordingTrack(r)!.elevations).toBeUndefined()
  })

  it('fits a long outing under the point limit', () => {
    let r = addFix(startRecording(T0), fix(0), T0)
    r = walk(r, 0, 8000, 6, 4, T0) // 48 km, 8001 points
    const track = recordingTrack(r)!
    expect(track.coordinates.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS)
    expect(track.coordinates.at(-1)![1]).toBeCloseTo(north(48_000)[1], 5)
  })
})
