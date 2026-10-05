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
})
