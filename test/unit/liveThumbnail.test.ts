import { describe, expect, it } from 'vitest'
import { LIVE_THUMBNAIL_HEIGHT, LIVE_THUMBNAIL_WIDTH, liveThumbnail } from '#shared/utils/liveThumbnail'
import type { LngLat } from '#shared/utils/routes'

const points = (path: string) => [...path.matchAll(/[ML](\d+) (\d+)/g)].map(([, x, y]) => [Number(x), Number(y)])

describe('liveThumbnail', () => {
  it('draws nothing without a route or a point', () => {
    expect(liveThumbnail(null, [])).toBeNull()
  })

  it('puts the route and the track in one box, the track on the route, north up', () => {
    const route: LngLat[] = [[3, 50], [3.1, 50], [3.2, 50.02]]
    const track: LngLat[] = [[3, 50], [3.1, 50]]
    const thumbnail = liveThumbnail(route, track)!
    const routePoints = points(thumbnail.route!)
    const trackPoints = points(thumbnail.track!)
    expect(trackPoints).toEqual(routePoints.slice(0, 2))
    expect(thumbnail.position).toEqual(trackPoints.at(-1))
    // North up: the last point of the route is higher.
    expect(routePoints[2]![1]).toBeLessThan(routePoints[0]![1]!)
    for (const [x, y] of routePoints) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(LIVE_THUMBNAIL_WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(LIVE_THUMBNAIL_HEIGHT)
    }
    // The wide track fills the width, centered.
    const xs = routePoints.map(([x]) => x!)
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(LIVE_THUMBNAIL_WIDTH, -1)
  })

  it('shows a single position in the middle, without lines', () => {
    expect(liveThumbnail(null, [[3, 50]])).toEqual({
      route: null,
      track: null,
      position: [LIVE_THUMBNAIL_WIDTH / 2, LIVE_THUMBNAIL_HEIGHT / 2],
    })
  })
})
