import { describe, expect, it } from 'vitest'
import type { OutingTrackPoint } from '#shared/utils/routes'
import { fastestSplit, outingSplits, speedProfile, type Split } from '~/utils/splits'

const METERS_PER_DEG_LAT = 111_195

// An outing northwards, a point every `stepM` meters, at `secondsPerKm(m)` and `altitude(m)` meters high.
function outing(totalM: number, secondsPerKm: (m: number) => number, altitude?: (m: number) => number, stepM = 10) {
  const track: OutingTrackPoint[] = []
  let seconds = 0
  for (let m = 0; m <= totalM; m += stepM) {
    if (m) seconds += (stepM / 1000) * secondsPerKm(m)
    track.push([6.12, 45.9 + m / METERS_PER_DEG_LAT, altitude ? altitude(m) : null, seconds, seconds])
  }
  return track
}
const steady = (secondsPerKm: number) => () => secondsPerKm

describe('outingSplits', () => {
  it('times each kilometre, and the last stretch', () => {
    const splits = outingSplits(outing(2500, steady(300)))
    expect(splits).toHaveLength(3)
    expect(splits.map(s => s.distanceM)).toEqual([1000, 1000, expect.closeTo(500, 0)])
    expect(splits.map(s => s.movingS)).toEqual([expect.closeTo(300, 0), expect.closeTo(300, 0), expect.closeTo(150, 0)])
    expect(splits[0]!.gainM).toBeNull()
  })

  it('leaves pauses and stops out', () => {
    // Ten minutes stopped at 1.5 km: the elapsed time jumps, the moving time doesn't.
    const track = outing(2500, steady(300)).map(([lng, lat, alt, elapsedS, movingS]): OutingTrackPoint =>
      [lng, lat, alt, elapsedS + (movingS > 450 ? 600 : 0), movingS])
    expect(outingSplits(track)[1]!.movingS).toBeCloseTo(300, 0)
  })

  it('leaves out a last stretch too short for a pace', () => {
    expect(outingSplits(outing(2030, steady(300)))).toHaveLength(2)
    expect(outingSplits(outing(40, steady(300)))).toEqual([])
  })

  it('gives the gain and loss of each kilometre from the GPS altitudes', () => {
    // Up 60 m, flat, then down 60 m
    const altitude = (m: number) => 400 + Math.min(m, 1000) * 0.06 - Math.max(0, m - 2000) * 0.06
    const splits = outingSplits(outing(3000, steady(360), altitude))
    expect(splits[0]!.gainM).toBeGreaterThan(50)
    expect(splits[0]!.lossM).toBe(0)
    expect(splits[1]!.gainM! + splits[1]!.lossM!).toBeLessThan(10)
    expect(splits[2]!.lossM).toBeGreaterThan(50)
    expect(splits.reduce((sum, s) => sum + s.gainM!, 0)).toBeCloseTo(60, -1)
  })
})

describe('fastestSplit', () => {
  const split = (movingS: number, distanceM = 1000): Split => ({ distanceM, movingS, gainM: null, lossM: null })

  it('picks the fastest full kilometre', () => {
    expect(fastestSplit([split(300), split(280), split(310)])).toBe(1)
    // The last stretch doesn't compete, however fast.
    expect(fastestSplit([split(300), split(310), split(60, 400)])).toBe(0)
  })

  it('needs two full kilometres to compare', () => {
    expect(fastestSplit([split(300), split(100, 500)])).toBeNull()
    expect(fastestSplit([])).toBeNull()
  })
})

describe('speedProfile', () => {
  it('spreads samples along the outing, with their position and speed', () => {
    const samples = speedProfile(outing(2000, steady(300)), 5)
    expect(samples.map(s => s.distanceM)).toEqual([0, 500, 1000, 1500, 2000].map(m => expect.closeTo(m, 0)))
    expect(samples[2]!.position[1]).toBeCloseTo(45.9 + 1000 / METERS_PER_DEG_LAT, 6)
    for (const sample of samples) expect(sample.speedMs).toBeCloseTo(1000 / 300, 2)
    expect(samples[0]!.elevationM).toBeNull()
  })

  it('follows changes of speed, and ignores pauses', () => {
    // 5 min/km for 1 km, then 4 min/km, with a 10 minute stop at 500 m
    const track = outing(2000, m => (m <= 1000 ? 300 : 240)).map(([lng, lat, alt, elapsedS, movingS]): OutingTrackPoint =>
      [lng, lat, alt, elapsedS + (movingS > 150 ? 600 : 0), movingS])
    const samples = speedProfile(track, 9)
    expect(samples[2]!.speedMs).toBeCloseTo(1000 / 300, 2)
    expect(samples[6]!.speedMs).toBeCloseTo(1000 / 240, 2)
  })

  it('measures a short outing over its whole length', () => {
    const samples = speedProfile(outing(120, steady(600), () => 500), 3)
    for (const sample of samples) {
      expect(sample.speedMs).toBeCloseTo(1000 / 600, 2)
      expect(sample.elevationM).toBeCloseTo(500, 6)
    }
  })
})
