import { describe, expect, it } from 'vitest'
import { BEST_EFFORTS_VERSION, bestEfforts, bestEffortsAreFresh } from '#shared/utils/bestEfforts'
import type { OutingTrackPoint } from '#shared/utils/routes'

const METERS_PER_DEG_LAT = 111_195
const METERS_PER_DEG_LNG = METERS_PER_DEG_LAT * Math.cos((45.9 * Math.PI) / 180)

// An outing northwards, a point every second at `speedMs(m)`, `east(i)` meters off the line (GPS noise).
function outing(totalM: number, speedMs: (m: number) => number, east: (i: number) => number = () => 0) {
  const track: OutingTrackPoint[] = []
  let m = 0
  for (let s = 0; m <= totalM; s++) {
    track.push([6.12 + east(s) / METERS_PER_DEG_LNG, 45.9 + m / METERS_PER_DEG_LAT, null, s, s])
    m += speedMs(m)
  }
  return track
}

describe('bestEfforts', () => {
  it('times each distance a runner covered', () => {
    // 12 km at 5 min/km (3.33 m/s): every best time at that pace, no half marathon.
    const efforts = bestEfforts(outing(12_000, () => 1000 / 300), 'run')
    expect(efforts.v).toBe(BEST_EFFORTS_VERSION)
    expect(efforts.times['1k']).toBeCloseTo(300, -0.5)
    expect(efforts.times['5k']).toBeCloseTo(1500, -0.5)
    expect(efforts.times['10k']).toBeCloseTo(3000, -0.5)
    expect(efforts.times.half).toBeUndefined()
    expect(efforts.hour_m).toBeUndefined()
  })

  it('finds the fastest stretch anywhere in the outing', () => {
    // 6 km at 6 min/km, with the 3rd kilometre at 4 min/km.
    const efforts = bestEfforts(outing(6000, m => (m >= 2000 && m < 3000 ? 1000 / 240 : 1000 / 360)), 'run')
    expect(efforts.times['1k']).toBeCloseTo(240, -0.5)
    expect(efforts.times['5k']).toBeGreaterThan(1600)
  })

  it('leaves pauses out, like the moving time', () => {
    const track = outing(2000, () => 1000 / 300).map(([lng, lat, alt, elapsedS, movingS]): OutingTrackPoint =>
      [lng, lat, alt, elapsedS > 150 ? elapsedS + 600 : elapsedS, movingS])
    expect(bestEfforts(track, 'run').times['1k']).toBeCloseTo(300, -0.5)
  })

  it('gives cyclists their best hour, and no runner\'s distances', () => {
    // 50 km at 30 km/h, then 30 km at 20 km/h.
    const efforts = bestEfforts(outing(80_000, m => (m < 50_000 ? 30 / 3.6 : 20 / 3.6)), 'ride')
    expect(efforts.times['1k']).toBeUndefined()
    expect(efforts.times['10k']).toBeCloseTo(1200, -0.5)
    expect(efforts.times['40k']).toBeCloseTo(4800, -0.5)
    expect(efforts.hour_m).toBeGreaterThan(29_900)
    expect(efforts.hour_m).toBeLessThanOrEqual(30_010)
  })

  it('gives hikers no best times', () => {
    expect(bestEfforts(outing(5000, () => 1.2), 'walk')).toEqual({ v: BEST_EFFORTS_VERSION, kind: 'walk', times: {} })
  })

  describe('no false record from GPS noise', () => {
    it('ignores zigzags around the track', () => {
      // 3 m to either side at every fix doubles the distance of the raw track.
      const efforts = bestEfforts(outing(6000, () => 1000 / 300, s => (s % 2 ? 3 : -3)), 'run')
      expect(efforts.times['1k']).toBeGreaterThan(297)
      expect(efforts.times['5k']).toBeGreaterThan(1490)
    })

    it('finds nothing faster in wilder zigzags', () => {
      // 8 m to either side: every step looks like a jump, and no effort is measured.
      const efforts = bestEfforts(outing(6000, () => 1000 / 300, s => (s % 2 ? 8 : -8)), 'run')
      expect(efforts.times['1k'] ?? Infinity).toBeGreaterThan(297)
    })

    it('ignores random GPS noise', () => {
      // Up to 5 m off the track in every direction, from a fixed pseudo-random sequence.
      let seed = 1
      const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
      const track = outing(6000, () => 1000 / 300).map(([lng, lat, ...rest]): OutingTrackPoint =>
        [lng + (random() * 5) / METERS_PER_DEG_LNG, lat + (random() * 5) / METERS_PER_DEG_LAT, ...rest])
      const efforts = bestEfforts(track, 'run')
      expect(efforts.times['1k']).toBeGreaterThan(295)
      expect(efforts.times['5k']).toBeGreaterThan(1490)
    })

    it('never spans a GPS jump', () => {
      // At 2.5 km the position jumps 400 m ahead within a second: the 1 km over it would take ~3 min.
      const track = outing(5000, () => 1000 / 300).map(([lng, lat, ...rest], i): OutingTrackPoint =>
        [lng, i >= 750 ? lat + 400 / METERS_PER_DEG_LAT : lat, ...rest])
      expect(bestEfforts(track, 'run').times['1k']).toBeCloseTo(300, -0.5)
    })

    it('never counts a move during a pause', () => {
      // Paused at 1 km and driven 3 km further over 20 minutes: the step after the pause has no moving time.
      const track = outing(5000, () => 1000 / 300).map(([lng, lat, alt, elapsedS, movingS], i): OutingTrackPoint =>
        i < 300 ? [lng, lat, alt, elapsedS, movingS] : [lng, lat + 3000 / METERS_PER_DEG_LAT, alt, elapsedS + 1200, movingS - 1])
      const efforts = bestEfforts(track, 'run')
      expect(efforts.times['1k']).toBeCloseTo(300, -0.5)
      expect(efforts.times['5k']).toBeUndefined()
    })

    it('never counts drift while standing still', () => {
      // Stopped at 500 m for 200 s, while the GPS swings 8 m back and forth: steps without moving time.
      const run = outing(2000, () => 1000 / 300)
      const stop = run[150]!
      const drift = Array.from({ length: 20 }, (_, k): OutingTrackPoint =>
        [stop[0] + (k % 2 ? 0 : 8 / METERS_PER_DEG_LNG), stop[1], null, stop[3] + (k + 1) * 10, stop[4]])
      const after = run.slice(151).map(([lng, lat, alt, elapsedS, movingS]): OutingTrackPoint => [lng, lat, alt, elapsedS + 200, movingS])
      expect(bestEfforts([...run.slice(0, 151), ...drift, ...after], 'run').times['1k']).toBeGreaterThan(295)
    })
  })
})

describe('bestEffortsAreFresh', () => {
  it('accepts best efforts of this version and kind only', () => {
    const efforts = { v: BEST_EFFORTS_VERSION, kind: 'run', times: {} }
    expect(bestEffortsAreFresh(efforts, 'run')).toBe(true)
    expect(bestEffortsAreFresh(efforts, 'ride')).toBe(false)
    expect(bestEffortsAreFresh({ ...efforts, v: BEST_EFFORTS_VERSION - 1 }, 'run')).toBe(false)
    expect(bestEffortsAreFresh(null, 'run')).toBe(false)
  })
})
