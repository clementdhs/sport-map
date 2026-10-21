import { describe, expect, it, vi } from 'vitest'
import type { EditorState, LngLat } from '#shared/utils/routes'
import { elevationStats } from '#shared/utils/routes'
import type { ElevationSources } from '#shared/utils/trackElevation'
import { recomputeRoute, routedRanges, type SavedRoute } from '../../scripts/routeElevations'

// `count` points about 11 m apart, going north.
const track = (count: number): LngLat[] => Array.from({ length: count }, (_, i) => [5.7, 45.1 + i * 0.0001])

const state = (...segments: [EditorState['segments'][number]['mode'], number, number][]): EditorState => ({
  waypoints: Array.from({ length: segments.length + 1 }, () => [5.7, 45.1]),
  segments: segments.map(([mode, start, end]) => ({ mode, start, end })),
})

describe('routedRanges', () => {
  it('takes the whole track of a drawn route, whatever its segments', () => {
    expect(routedRanges({ source: 'drawn', coordinates: track(10), editorState: null })).toEqual([[0, 9]])
    expect(routedRanges({ source: 'drawn', coordinates: track(10), editorState: state(['locked', 0, 4], ['snap', 4, 9]) }))
      .toEqual([[0, 9]])
  })

  it('takes nothing from a GPX import or a recording without routed segments', () => {
    expect(routedRanges({ source: 'gpx_import', coordinates: track(10), editorState: null })).toEqual([])
    expect(routedRanges({ source: 'gpx_import', coordinates: track(10), editorState: state(['imported', 0, 9]) })).toEqual([])
    expect(routedRanges({ source: 'recorded', coordinates: track(10), editorState: state(['locked', 0, 9]) })).toEqual([])
  })

  it('takes the routed segments added to an import, without the junction points of the file', () => {
    const editorState = state(['snap', 0, 3], ['imported', 3, 10], ['straight', 10, 12], ['snap', 12, 15], ['locked', 15, 19])
    expect(routedRanges({ source: 'gpx_import', coordinates: track(20), editorState })).toEqual([[0, 2], [11, 14]])
  })

  it('takes segments that don\'t share their junction whole', () => {
    expect(routedRanges({ source: 'recorded', coordinates: track(10), editorState: state(['locked', 0, 4], ['snap', 5, 9]) }))
      .toEqual([[5, 9]])
  })

  it('takes nothing when the editor state doesn\'t match the track', () => {
    expect(routedRanges({ source: 'gpx_import', coordinates: track(10), editorState: state(['imported', 0, 4], ['snap', 4, 12]) }))
      .toEqual([])
  })
})

// The IGN covers every point: its elevation is 100 m plus 10 m per point.
const ign = (): ElevationSources => ({
  precise: vi.fn(async (points: LngLat[]) => points.map(([, lat]) => 100 + Math.round((lat - 45.1) / 0.0001) * 10)),
  fallback: vi.fn(async () => { throw new Error('not called') }),
})

const route = (overrides: Partial<SavedRoute>): SavedRoute => ({
  id: 'r', source: 'drawn', coordinates: track(6), elevations: null, gain: null, loss: null, editorState: null, ...overrides,
})

describe('recomputeRoute', () => {
  it('measures a drawn route again, with its gain and loss computed as when saving it', async () => {
    const coordinates = track(6)
    const result = await recomputeRoute(route({ coordinates, elevations: [0, 0, 0, 0, 0, 0], gain: 0, loss: 0 }), ign())
    const elevations = [100, 110, 120, 130, 140, 150]
    expect(result).toEqual({ status: 'changed', elevations, ...elevationStats(coordinates, elevations) })
  })

  it('finds nothing to change when run again', async () => {
    const first = await recomputeRoute(route({}), ign())
    if (first.status !== 'changed') throw new Error(first.status)
    const again = await recomputeRoute(route({ elevations: first.elevations, gain: first.gain, loss: first.loss }), ign())
    expect(again.status).toBe('unchanged')
  })

  it('keeps the elevations of an import outside its routed segments', async () => {
    const sources = ign()
    const result = await recomputeRoute(route({
      source: 'gpx_import',
      elevations: [1, 2, 3, 4, 5, 6],
      editorState: state(['imported', 0, 2], ['snap', 2, 5]),
    }), sources)
    expect(result).toMatchObject({ status: 'changed', elevations: [1, 2, 3, 130, 140, 150] })
    expect(sources.precise).toHaveBeenCalledOnce()
    expect(vi.mocked(sources.precise).mock.calls[0]![0]).toHaveLength(3)
  })

  it('skips an import whose elevations are missing, and a route without routed segment', async () => {
    const editorState = state(['imported', 0, 2], ['snap', 2, 5])
    expect(await recomputeRoute(route({ source: 'gpx_import', editorState }), ign())).toEqual({ status: 'skipped', reason: 'no elevations' })
    expect(await recomputeRoute(route({ source: 'recorded' }), ign())).toEqual({ status: 'skipped', reason: 'no routed segment' })
  })

  it('lets a failure of the elevation services through, for the caller to report', async () => {
    const sources = ign()
    vi.mocked(sources.precise).mockRejectedValue(new Error('IGN : HTTP 503'))
    await expect(recomputeRoute(route({}), sources)).rejects.toThrow('IGN : HTTP 503')
  })
})
