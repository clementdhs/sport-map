import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeAlongPaths, roundTrip, trackFields } from '../../server/utils/openrouteservice'
import type { LngLat, SportType } from '#shared/utils/routes'

const A: LngLat = [6.12, 45.9]
const B: LngLat = [6.13, 45.91]

describe('routeAlongPaths', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['running', 'foot-walking'],
    ['trail', 'foot-hiking'],
    ['hiking', 'foot-hiking'],
    ['cycling', 'cycling-regular'],
    ['road_cycling', 'cycling-road'],
    ['mountain_biking', 'cycling-mountain'],
  ] as [SportType, string][])('routes %s with the %s profile', async (sport, profile) => {
    const fetch = vi.fn().mockResolvedValue({ features: [{ geometry: { coordinates: [[...A, 450], [...B, 460]] } }] })
    vi.stubGlobal('useRuntimeConfig', () => ({ openrouteserviceKey: 'test-key' }))
    vi.stubGlobal('$fetch', fetch)

    await routeAlongPaths({} as H3Event, A, B, sport)

    expect(fetch).toHaveBeenCalledWith(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, expect.anything())
  })

  it.each([
    ['hiking', 'sac_scale', 'mtb_scale'],
    ['mountain_biking', 'mtb_scale', 'sac_scale'],
  ] as const)('returns the way info of a %s route, its difficulty on the %s', async (sport, scale, other) => {
    const extras = {
      surface: { values: [[0, 1, 3]] },
      waytype: { values: [[0, 1, 4]] },
      traildifficulty: { values: [[0, 1, 2]] },
    }
    const fetch = vi.fn().mockResolvedValue({ features: [{ geometry: { coordinates: [[...A, 450], [...B, 460]] }, properties: { extras } }] })
    vi.stubGlobal('useRuntimeConfig', () => ({ openrouteserviceKey: 'test-key' }))
    vi.stubGlobal('$fetch', fetch)

    const { wayInfo } = await routeAlongPaths({} as H3Event, A, B, sport)

    expect(fetch.mock.calls[0]![1].body.extra_info).toEqual(['surface', 'waytype', 'traildifficulty'])
    expect(wayInfo).toMatchObject({ surface: [[0, 1, 3]], waytype: [[0, 1, 4]], [scale]: [[0, 1, 2]], [other]: [] })
  })
})

describe('roundTrip', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for a loop from the start with the length and seed, and returns its length', async () => {
    const fetch = vi.fn().mockResolvedValue({
      features: [{ geometry: { coordinates: [[...A, 450], [...B, 460], [...A, 450]] }, properties: { summary: { distance: 2950.4 } } }],
    })
    vi.stubGlobal('useRuntimeConfig', () => ({ openrouteserviceKey: 'test-key' }))
    vi.stubGlobal('$fetch', fetch)

    const { points, lengthM } = await roundTrip({} as H3Event, A, 3000, 'trail', 42)

    const [url, { body }] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.openrouteservice.org/v2/directions/foot-hiking/geojson')
    expect(body.coordinates).toEqual([A])
    expect(body.options).toEqual({ round_trip: { length: 3000, points: 3, seed: 42 } })
    expect(body.elevation).toBe(true)
    expect(points).toHaveLength(3)
    expect(lengthM).toBe(2950.4)
  })
})

describe('trackFields', () => {
  it('rounds coordinates to 6 decimals and elevations to 1', () => {
    expect(trackFields([[6.1234567, 45.9876543, 450.26]])).toEqual({ coordinates: [[6.123457, 45.987654]], elevations: [450.3] })
  })
})
