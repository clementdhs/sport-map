import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withMeasuredElevations } from '../../server/utils/elevation'
import type { LngLatEle } from '#shared/utils/routes'

// A segment routed by OpenRouteService, with its (overestimated) SRTM elevations.
const routed: LngLatEle[] = [[6.0306, 45.0552, 700], [6.04, 45.06, 760], [6.05, 45.07, 830]]

const ignAnswer = (elevations: number[]) => ({ elevations })
const httpError = (status: number) => Object.assign(new Error(`${status}`), { response: { status } })

describe('withMeasuredElevations', () => {
  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ignAltimetryUrl: 'https://ign.test', openMeteoElevationUrl: 'https://open-meteo.test' }))
    vi.stubGlobal('apiError', (_event: H3Event, statusCode: number, key: string) => Object.assign(new Error(key), { statusCode }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('replaces OpenRouteService elevations with the IGN ones', async () => {
    const fetch = vi.fn().mockResolvedValue(ignAnswer([719.5, 741.2, 802.8]))
    vi.stubGlobal('$fetch', fetch)

    expect(await withMeasuredElevations({} as H3Event, routed)).toEqual([[6.0306, 45.0552, 719.5], [6.04, 45.06, 741.2], [6.05, 45.07, 802.8]])
    expect(fetch).toHaveBeenCalledWith('https://ign.test', expect.objectContaining({ method: 'POST' }))
  })

  it('keeps OpenRouteService elevations when the IGN is down', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(httpError(502)))

    expect(await withMeasuredElevations({} as H3Event, routed)).toBe(routed)
  })

  it('asks the IGN once more after a 429', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce(ignAnswer([719.5, 741.2, 802.8]))
    vi.stubGlobal('$fetch', fetch)

    const result = withMeasuredElevations({} as H3Event, routed)
    await vi.advanceTimersByTimeAsync(2000)

    expect((await result).map(([, , ele]) => ele)).toEqual([719.5, 741.2, 802.8])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
