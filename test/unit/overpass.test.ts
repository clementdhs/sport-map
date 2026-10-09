import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bbox } from '#shared/utils/osmRoutes'
import { LocalizedError } from '~/utils/localizedError'
import { clearOverpassCache, OVERPASS_URLS, overpassQuery, searchOsmRoutes } from '~/utils/overpass'
import fontainebleau from './fixtures/overpass-fontainebleau.json'

const BBOX: Bbox = [2.58, 48.38, 2.72, 48.46]
const [PRIMARY, FALLBACK] = OVERPASS_URLS

const busy = Object.assign(new Error('504 Gateway Timeout'), { response: { status: 504 } })

describe('overpassQuery', () => {
  it('asks for the route relations of the kind in the area, south-west first', () => {
    const query = overpassQuery(BBOX, 'foot')
    expect(query).toContain('relation["type"="route"]["route"~"^(hiking|foot)$"](48.38,2.58,48.46,2.72)')
    expect(query).toContain('out geom;')
    expect(overpassQuery(BBOX, 'mtb')).toContain('"^(mtb)$"')
  })
})

describe('searchOsmRoutes', () => {
  beforeEach(() => {
    clearOverpassCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the stitched routes of the area', async () => {
    const fetch = vi.fn().mockResolvedValue(fontainebleau)
    vi.stubGlobal('$fetch', fetch)

    const routes = await searchOsmRoutes(BBOX, 'foot')

    expect(routes.map(route => route.id)).toEqual([157632, 255680, 389996, 2901743])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(PRIMARY, expect.objectContaining({ method: 'POST' }))
    expect(fetch.mock.calls[0]![1].body.get('data')).toBe(overpassQuery(BBOX, 'foot'))
  })

  it('tries the next instance when one is busy', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(busy).mockResolvedValueOnce(fontainebleau)
    vi.stubGlobal('$fetch', fetch)

    expect(await searchOsmRoutes(BBOX, 'foot')).toHaveLength(4)
    expect(fetch).toHaveBeenLastCalledWith(FALLBACK, expect.anything())
  })

  it('doesn\'t trust an answer cut short by the server\'s timeout', async () => {
    const cut = { ...fontainebleau, remark: 'runtime error: Query timed out in "recurse" at line 1 after 26 seconds.' }
    const fetch = vi.fn().mockResolvedValueOnce(cut).mockResolvedValueOnce(fontainebleau)
    vi.stubGlobal('$fetch', fetch)

    await searchOsmRoutes(BBOX, 'foot')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('tries each instance a second time, in turn', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(busy).mockRejectedValueOnce(busy).mockResolvedValueOnce(fontainebleau)
    vi.stubGlobal('$fetch', fetch)

    expect(await searchOsmRoutes(BBOX, 'foot')).toHaveLength(4)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([PRIMARY, FALLBACK, PRIMARY])
  })

  it('reports a busy service when every attempt fails', async () => {
    const fetch = vi.fn().mockRejectedValue(busy)
    vi.stubGlobal('$fetch', fetch)

    const error = await searchOsmRoutes(BBOX, 'foot').catch(error => error)
    expect(error).toBeInstanceOf(LocalizedError)
    expect(error.key).toBe('errors.overpassBusy')
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('stops trying when the time budget is spent', async () => {
    const start = Date.now()
    vi.spyOn(Date, 'now').mockReturnValueOnce(start).mockReturnValueOnce(start).mockReturnValue(start + 56_000)
    const fetch = vi.fn().mockRejectedValue(busy)
    vi.stubGlobal('$fetch', fetch)

    await expect(searchOsmRoutes(BBOX, 'foot')).rejects.toBeInstanceOf(LocalizedError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops at once when a newer search aborts it', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockImplementation(() => {
      controller.abort()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    })
    vi.stubGlobal('$fetch', fetch)

    await expect(searchOsmRoutes(BBOX, 'foot', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(PRIMARY, expect.objectContaining({ signal: controller.signal }))
  })

  it('serves a repeated search from the cache', async () => {
    const fetch = vi.fn().mockResolvedValue(fontainebleau)
    vi.stubGlobal('$fetch', fetch)

    await searchOsmRoutes(BBOX, 'foot')
    await searchOsmRoutes(BBOX, 'foot')
    expect(fetch).toHaveBeenCalledTimes(1)

    await searchOsmRoutes(BBOX, 'bicycle')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('doesn\'t cache a failed search', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(busy).mockRejectedValueOnce(busy).mockRejectedValueOnce(busy)
      .mockRejectedValueOnce(busy).mockResolvedValue(fontainebleau)
    vi.stubGlobal('$fetch', fetch)

    await expect(searchOsmRoutes(BBOX, 'foot')).rejects.toThrow()
    expect(await searchOsmRoutes(BBOX, 'foot')).toHaveLength(4)
  })
})
