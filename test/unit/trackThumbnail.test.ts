import { describe, expect, it } from 'vitest'
import { THUMBNAIL_SIZE, thumbnailPath, thumbnailStart } from '#shared/utils/trackThumbnail'

function points(path: string): [number, number][] {
  return [...path.matchAll(/[ML](\d+) (\d+)/g)].map(m => [Number(m[1]), Number(m[2])])
}

describe('thumbnailPath', () => {
  it('draws a track north up, its longest side filling the box minus the padding', () => {
    // 1 km east then 2 km north, in Annecy
    const lat0 = 45.9
    const dLat = 1000 / 111_320
    const dLng = dLat / Math.cos((lat0 * Math.PI) / 180)
    const path = thumbnailPath([[6.12, lat0], [6.12 + dLng, lat0], [6.12 + dLng, lat0 + 2 * dLat]])!
    // Height 80 units for 2 km, so 40 for the 1 km side, centered horizontally: x from 30 to 70.
    expect(points(path)).toEqual([[30, 90], [70, 90], [70, 10]])
    expect(path).toBe('M30 90L70 90L70 10')
  })

  it('keeps every point inside the box', () => {
    const track: [number, number][] = Array.from({ length: 50 }, (_, i) => [2.3 + Math.cos(i / 5) * 0.01, 48.85 + Math.sin(i / 3) * 0.02])
    for (const [x, y] of points(thumbnailPath(track)!)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(THUMBNAIL_SIZE)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(THUMBNAIL_SIZE)
    }
  })

  it('drops the points that round to the previous one', () => {
    expect(thumbnailPath([[0, 0], [0.000001, 0], [1, 0]])).toBe('M10 50L90 50')
  })

  it('returns null without a drawable track', () => {
    expect(thumbnailPath(null)).toBeNull()
    expect(thumbnailPath([])).toBeNull()
    expect(thumbnailPath([[6.1, 45.9]])).toBeNull()
    expect(thumbnailPath([[6.1, 45.9], [6.1, 45.9]])).toBeNull()
  })
})

describe('thumbnailStart', () => {
  it('reads the first point of the path', () => {
    expect(thumbnailStart('M30 90L70 90')).toEqual([30, 90])
    expect(thumbnailStart('')).toBeNull()
  })
})
