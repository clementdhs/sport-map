import { readBody } from 'h3'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'

// Fake elevations: one metre higher at each point.
const asked: LngLat[][] = []
registerEndpoint('/api/elevations', {
  method: 'POST',
  handler: async (event) => {
    const { coordinates } = await readBody<{ coordinates: LngLat[] }>(event)
    asked.push(coordinates)
    return { elevations: coordinates.map((_, i) => 100 + i) }
  },
})

// Eastwards, about 738 m between points.
const A: LngLat = [2.6, 48.4]
const B: LngLat = [2.61, 48.4]
const C: LngLat = [2.62, 48.4]
const D: LngLat = [2.63, 48.4]
const SEGMENT = 738.25

const osmRoute = (lines: LngLat[][], complete = true): OsmRoute => ({
  id: 1, version: 1, route: 'hiking', name: 'GR 1', ref: 'GR 1', network: 'nwn', roundtrip: null, grade: null, complete, distance_m: 0, lines,
})
const open = osmRoute([[A, B, C, D]])
// Two pieces: a short one in the south, the longer one 2 km north.
const pieces = osmRoute([[A, B], [[2.6, 48.42], [2.61, 48.42], [2.62, 48.42]]], false)

beforeEach(() => {
  setActivePinia(createPinia())
  asked.length = 0
})

// Cancels the elevations a test left waiting.
afterEach(() => useOsmSectionStore().stop())

describe('osmSection', () => {
  it('starts with the whole route, or the longest piece of an incomplete one', () => {
    const section = useOsmSectionStore()
    section.start(open)
    expect(section.section).toEqual({ line: 0, from: 0, to: expect.closeTo(3 * SEGMENT, 0) })
    expect(section.length).toBeCloseTo(3 * SEGMENT, 0)
    expect(section.ends).toEqual({ from: A, to: D })

    section.start(pieces)
    expect(section.section).toMatchObject({ line: 1, from: 0 })
  })

  it('places the departure then the arrival where the route is tapped', () => {
    const section = useOsmSectionStore()
    section.start(open)
    section.pick([2.61, 48.4003])
    expect(section.section!.from).toBeCloseTo(SEGMENT, 0)
    expect(section.nextEnd).toBe('to')
    section.pick([2.625, 48.3998])
    expect(section.section!.to).toBeCloseTo(2.5 * SEGMENT, 0)
    expect(section.coordinates).toEqual([B, C, [2.625, 48.4]])
    expect(section.nextEnd).toBe('from')
  })

  it('moves to another piece of an incomplete route when it is tapped, but keeps dragged ends on its own', () => {
    const section = useOsmSectionStore()
    section.start(pieces)
    section.pick([2.605, 48.4001])
    expect(section.section).toEqual({ line: 0, from: expect.closeTo(SEGMENT / 2, 0), to: expect.closeTo(SEGMENT, 0) })

    section.moveEnd('to', [2.605, 48.419])
    expect(section.section).toEqual({ line: 0, from: expect.closeTo(SEGMENT / 2, 0), to: expect.closeTo(SEGMENT / 2, 0) })
  })

  it('places the arrival at a distance from the departure, and keeps typed ends on the route', () => {
    const section = useOsmSectionStore()
    section.start(open)
    section.setEnd('from', 500)
    section.setLength(1000)
    expect(section.section).toMatchObject({ from: 500, to: 1500 })
    section.setEnd('to', 10_000)
    expect(section.section!.to).toBeCloseTo(3 * SEGMENT, 0)
    section.setEnd('from', -5)
    expect(section.section!.from).toBe(0)
  })

  it('asks the elevations once the ends stay still, and gives them to the editor with the track', async () => {
    const section = useOsmSectionStore()
    section.start(open)
    section.setEnd('from', 500)
    section.setEnd('to', 1200)
    section.moveEnd('to', [2.625, 48.4])
    expect(section.gainStatus).toBe('pending')

    await vi.waitFor(() => expect(section.gainStatus).toBe('known'), { timeout: 3000 })
    expect(asked).toHaveLength(1)
    const track = section.track('GR 1, km 0,5 à 1,8')!
    expect(track.coordinates).toEqual(asked[0])
    expect(track.coordinates[0]).toEqual(section.ends!.from)
    expect(track.coordinates.at(-1)).toEqual([2.625, 48.4])
    expect(section.gain).toBe(Math.round(elevationStats(track.coordinates, track.elevations!).gain))

    useOsmDiscoverStore().importIntoEditor(open, track)
    const editor = useRouteEditorStore()
    expect(editor.details.name).toBe('GR 1, km 0,5 à 1,8')
    expect(editor.segments[0]).toMatchObject({ coordinates: track.coordinates, elevations: track.elevations, loading: false })
    // The editor doesn't ask them again.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(asked).toHaveLength(1)
  })

  it('imports nothing shorter than 100 m', () => {
    const section = useOsmSectionStore()
    section.start(open)
    section.setEnd('from', 500)
    section.setEnd('to', 550)
    expect(section.tooShort).toBe(true)
    expect(section.gainStatus).toBe('unknown')
    expect(section.track(null)).toBeNull()
  })
})
