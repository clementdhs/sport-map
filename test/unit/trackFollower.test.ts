import { describe, expect, it } from 'vitest'
import type { LngLat } from '#shared/utils/routes'
import { buildTrackModel, locateOnTrack } from '~/utils/trackFollower'

const METERS_PER_DEG_LAT = 111_195

// `count` points every 10 m going north from Annecy, then optionally back south.
function lineNorth(count: number): LngLat[] {
  return Array.from({ length: count }, (_, i) => [6.12, 45.9 + (i * 10) / METERS_PER_DEG_LAT])
}
const northOf = (meters: number, eastM = 0): LngLat =>
  [6.12 + eastM / (METERS_PER_DEG_LAT * Math.cos((45.9 * Math.PI) / 180)), 45.9 + meters / METERS_PER_DEG_LAT]

describe('locateOnTrack', () => {
  const line = lineNorth(101) // 1 km
  const model = buildTrackModel(line, line.map((_, i) => 500 + i)) // steady climb of 100 m

  it('measures the distance done and left, and the gain left', () => {
    const progress = locateOnTrack(model, northOf(400))
    expect(progress.doneM).toBeCloseTo(400, -1)
    expect(progress.remainingM).toBeCloseTo(600, -1)
    expect(progress.offTrackM).toBeLessThan(1)
    // About 60 m left to climb, minus what the smoothing flattens at the top.
    expect(progress.remainingGainM).toBeGreaterThan(45)
    expect(progress.remainingGainM).toBeLessThanOrEqual(60)
  })

  it('tells how far off the track the position is', () => {
    const progress = locateOnTrack(model, northOf(500, 80))
    expect(progress.offTrackM).toBeCloseTo(80, 0)
    expect(progress.doneM).toBeCloseTo(500, -1)
    expect(progress.snapped[0]).toBeCloseTo(6.12, 6)
  })

  it('stays within the track at both ends', () => {
    expect(locateOnTrack(model, northOf(-200)).doneM).toBe(0)
    expect(locateOnTrack(model, northOf(1300)).remainingM).toBe(0)
  })

  it('counts what is left of the climb of the current segment', () => {
    // Two 1 km segments: a 100 m climb, then flat. Halfway up, 50 m are left.
    const sparse = buildTrackModel([northOf(0), northOf(1000), northOf(2000)], [500, 600, 600])
    expect(locateOnTrack(sparse, northOf(500)).remainingGainM).toBeCloseTo(50, 0)
    expect(locateOnTrack(sparse, northOf(1500)).remainingGainM).toBe(0)
  })

  it('follows the right leg of an out-and-back', () => {
    const outAndBack = [...line, ...line.slice(0, -1).reverse()] // 2 km
    const twice = buildTrackModel(outAndBack, null)
    const spot = northOf(300)
    // Without history, the first passage; on the way back, the second one.
    expect(locateOnTrack(twice, spot).doneM).toBeCloseTo(300, -1)
    expect(locateOnTrack(twice, spot, 1650).doneM).toBeCloseTo(1700, -1)
    expect(locateOnTrack(twice, spot, 1650).remainingGainM).toBeNull()
  })
})
