import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeAlongPaths } from '../../server/utils/openrouteservice'
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
