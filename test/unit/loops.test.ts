import { describe, expect, it } from 'vitest'
import { isOnTarget, loopLengthForDuration, loopWaypointIndices, nextLoopLength } from '#shared/utils/loops'
import { trackDistances, type LngLat } from '#shared/utils/routes'

// A square loop from Annecy, a point every 100 m, sides of `sideM` meters.
function squareLoop(sideM: number): LngLat[] {
  const lat0 = 45.9
  const dLat = 100 / 111_320
  const dLng = dLat / Math.cos(lat0 * Math.PI / 180)
  const steps = sideM / 100
  const points: LngLat[] = []
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const
  let [x, y] = [0, 0]
  points.push([6.12, lat0])
  for (const [dx, dy] of directions) {
    for (let i = 0; i < steps; i++) {
      x += dx
      y += dy
      points.push([6.12 + x * dLng, lat0 + y * dLat])
    }
  }
  return points
}

describe('isOnTarget', () => {
  it('accepts loops within 10 % of the target', () => {
    expect(isOnTarget(10_000, 10_000)).toBe(true)
    expect(isOnTarget(9_000, 10_000)).toBe(true)
    expect(isOnTarget(11_000, 10_000)).toBe(true)
    expect(isOnTarget(8_990, 10_000)).toBe(false)
    expect(isOnTarget(11_010, 10_000)).toBe(false)
  })
})

describe('nextLoopLength', () => {
  it('asks for the target first', () => {
    expect(nextLoopLength(10_000, [])).toBe(10_000)
  })

  it('then scales the last request by how far off its loop was', () => {
    expect(nextLoopLength(10_000, [{ requestedM: 10_000, lengthM: 12_500 }])).toBe(8000)
    expect(nextLoopLength(10_000, [{ requestedM: 10_000, lengthM: 8000 }])).toBe(12_500)
  })

  it('then follows the line through the last two tries', () => {
    // Loops grow by 2 m per meter asked for: 10 000 m needs 7 000 m.
    const tries = [{ requestedM: 10_000, lengthM: 16_000 }, { requestedM: 6_250, lengthM: 8_500 }]
    expect(nextLoopLength(10_000, tries)).toBe(7000)
  })

  it('falls back on scaling when a longer request gave a shorter loop', () => {
    const tries = [{ requestedM: 10_000, lengthM: 12_000 }, { requestedM: 8_000, lengthM: 12_500 }]
    expect(nextLoopLength(10_000, tries)).toBe(6400)
  })

  it('stays between a quarter and twice the target, and within the API limits', () => {
    expect(nextLoopLength(10_000, [{ requestedM: 10_000, lengthM: 50_000 }])).toBe(2500)
    expect(nextLoopLength(10_000, [{ requestedM: 10_000, lengthM: 2_000 }])).toBe(20_000)
    expect(nextLoopLength(90_000, [{ requestedM: 90_000, lengthM: 60_000 }])).toBe(100_000)
    expect(nextLoopLength(1_500, [{ requestedM: 1_500, lengthM: 3_000 }])).toBe(1000)
  })
})

describe('loopLengthForDuration', () => {
  it('turns a duration into a distance at the sport speed on the flat', () => {
    expect(loopLengthForDuration('running', 60)).toBe(10_000)
    expect(loopLengthForDuration('hiking', 90)).toBe(7500)
    expect(loopLengthForDuration('road_cycling', 120)).toBe(50_000)
    // At the member's pace (#146): 5:00/km for an hour
    expect(loopLengthForDuration('running', 60, 5)).toBe(12_000)
  })
})

describe('loopWaypointIndices', () => {
  it('cuts a 10 km loop every 2 km, at points of the track', () => {
    const loop = squareLoop(2500)
    const indices = loopWaypointIndices(loop)
    expect(indices).toHaveLength(6)
    expect(indices[0]).toBe(0)
    expect(indices.at(-1)).toBe(loop.length - 1)
    // Within a point (100 m) after each fifth of the loop.
    const along = trackDistances(loop)
    const total = along.at(-1)!
    indices.slice(1, -1).forEach((index, k) => {
      expect(along[index]! - (k + 1) * total / 5).toBeGreaterThanOrEqual(0)
      expect(along[index]! - (k + 1) * total / 5).toBeLessThan(101)
    })
  })

  it('keeps 4 segments on short loops and 10 on long ones', () => {
    expect(loopWaypointIndices(squareLoop(500))).toHaveLength(5)
    expect(loopWaypointIndices(squareLoop(15_000))).toHaveLength(11)
  })

  it('never repeats a point when the loop has few of them', () => {
    const loop: LngLat[] = [[6.12, 45.9], [6.13, 45.9], [6.12, 45.9]]
    expect(loopWaypointIndices(loop)).toEqual([0, 1, 2])
  })
})
