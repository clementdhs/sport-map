import { describe, expect, it } from 'vitest'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import { MAX_ROUTE_POINTS, type LngLat } from '#shared/utils/routes'
import { osmRouteTrack } from '~/utils/osmImport'

// A straight line northwards, a point every metre or so.
const line = (count: number): LngLat[] => Array.from({ length: count }, (_, i) => [2.6, 48.4 + i * 0.00001])

const route = (overrides: Partial<OsmRoute>): OsmRoute => ({
  id: 1, route: 'hiking', name: 'Tour du lac', ref: 'PR 3', network: 'lwn', roundtrip: null, grade: null, complete: true, distance_m: 0, lines: [line(100)], ...overrides,
})

describe('osmRouteTrack', () => {
  it('keeps the name, else the reference', () => {
    expect(osmRouteTrack(route({})).name).toBe('Tour du lac')
    expect(osmRouteTrack(route({ name: null })).name).toBe('PR 3')
    expect(osmRouteTrack(route({ name: null, ref: null })).name).toBeNull()
  })

  it('resamples the line like a GPX track, without elevations', () => {
    const track = osmRouteTrack(route({ lines: [line(20_000)] }))
    expect(track.elevations).toBeNull()
    expect(track.coordinates.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS)
    expect(track.coordinates[0]).toEqual(line(1)[0])
    expect(track.coordinates.at(-1)).toEqual(line(20_000).at(-1))
    expect(track.coordinates.every(point => point.length === 2)).toBe(true)
  })
})
