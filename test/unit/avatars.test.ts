import { describe, expect, it, vi } from 'vitest'
import { centeredCrop, clampCrop, MAX_AVATAR_ZOOM, panCrop, zoomCrop } from '#shared/utils/avatars'
import { createSignedUrlCache } from '~/utils/avatarUrls'

describe('avatar crop', () => {
  it('starts on the largest centered square', () => {
    expect(centeredCrop(4000, 3000)).toEqual({ x: 500, y: 0, size: 3000 })
    expect(centeredCrop(600, 800)).toEqual({ x: 0, y: 100, size: 600 })
  })

  it('keeps the square inside the image', () => {
    expect(clampCrop({ x: -20, y: 900, size: 500 }, 1000, 1000)).toEqual({ x: 0, y: 500, size: 500 })
    expect(clampCrop({ x: 10, y: 10, size: 2000 }, 1200, 900)).toEqual({ x: 10, y: 0, size: 900 })
  })

  it('zooms around the center of the square, within its limits', () => {
    const start = centeredCrop(4000, 3000)
    expect(zoomCrop(start, 4000, 3000, 2)).toEqual({ x: 1250, y: 750, size: 1500 })
    expect(zoomCrop(start, 4000, 3000, 99).size).toBe(3000 / MAX_AVATAR_ZOOM)
    expect(zoomCrop(start, 4000, 3000, 0.5)).toEqual(start)
    // Zooming out near an edge pulls the square back inside.
    expect(zoomCrop({ x: 0, y: 0, size: 750 }, 4000, 3000, 1)).toEqual({ x: 0, y: 0, size: 3000 })
  })

  it('moves the square against the drag, scaled from the frame to the image', () => {
    // A 1500 px square in a 300 px frame: 1 screen pixel is 5 image pixels.
    const crop = { x: 1250, y: 750, size: 1500 }
    expect(panCrop(crop, 4000, 3000, 20, -10, 300)).toEqual({ x: 1150, y: 800, size: 1500 })
    expect(panCrop(crop, 4000, 3000, -10_000, 10_000, 300)).toEqual({ x: 2500, y: 0, size: 1500 })
  })
})

describe('createSignedUrlCache', () => {
  const HOUR_MS = 3_600_000
  const signer = () => vi.fn(async (paths: string[]) => paths.map(path => `https://storage.test/${path}?token=${Math.random()}`))

  it('signs the paths asked for in the same tick in one request, each once', async () => {
    const sign = signer()
    const cache = createSignedUrlCache(sign, HOUR_MS)
    const [a, b, again] = await Promise.all([cache.get('u1/a.webp'), cache.get('u2/b.webp'), cache.get('u1/a.webp')])
    expect(sign).toHaveBeenCalledOnce()
    expect(sign).toHaveBeenCalledWith(['u1/a.webp', 'u2/b.webp'])
    expect(a).toMatch(/^https:\/\/storage\.test\/u1\/a\.webp\?/)
    expect(b).toMatch(/u2\/b\.webp/)
    expect(again).toBe(a)
  })

  it('keeps a URL until shortly before it expires, then signs it again', async () => {
    let now = 0
    const sign = signer()
    const cache = createSignedUrlCache(sign, HOUR_MS, () => now)
    const first = await cache.get('u1/a.webp')
    now = 50 * 60_000
    expect(cache.peek('u1/a.webp')).toBe(first)
    expect(await cache.get('u1/a.webp')).toBe(first)
    expect(sign).toHaveBeenCalledOnce()

    now = 56 * 60_000
    expect(cache.peek('u1/a.webp')).toBeUndefined()
    const renewed = await cache.get('u1/a.webp')
    expect(renewed).not.toBe(first)
    expect(sign).toHaveBeenCalledTimes(2)
  })

  it('keeps neither failures nor paths that could not be signed', async () => {
    const sign = vi.fn<(paths: string[]) => Promise<(string | null)[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([null])
      .mockResolvedValueOnce(['https://storage.test/u1/a.webp?token=1'])
    const cache = createSignedUrlCache(sign, HOUR_MS)
    expect(await cache.get('u1/a.webp')).toBeNull()
    expect(await cache.get('u1/a.webp')).toBeNull()
    expect(cache.peek('u1/a.webp')).toBeUndefined()
    expect(await cache.get('u1/a.webp')).toBe('https://storage.test/u1/a.webp?token=1')
    expect(sign).toHaveBeenCalledTimes(3)
  })
})
