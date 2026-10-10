import { describe, expect, it } from 'vitest'
import { demSource } from '~/utils/mapTerrain'
import { flatViewBounds } from '~/utils/mapViewState'

describe('demSource', () => {
  it('finds the elevation source of MapTiler Outdoor', () => {
    expect(demSource({
      sources: {
        'contours': { type: 'vector', url: 'https://example.test/contours.json' },
        'terrain-rgb': { type: 'raster-dem', url: 'https://example.test/terrain.json' },
      },
    })).toBe('terrain-rgb')
  })

  it('finds none in a style without elevation', () => {
    expect(demSource({ sources: { maplibre: { type: 'vector', url: 'https://example.test/tiles.json' } } })).toBeUndefined()
    expect(demSource({ sources: {} })).toBeUndefined()
  })
})

describe('flatViewBounds', () => {
  it('covers the whole world at zoom 0 on a 512 px square', () => {
    const [west, south, east, north] = flatViewBounds([0, 0], 0, 0, 512, 512)
    expect(west).toBeCloseTo(-180)
    expect(east).toBeCloseTo(180)
    expect(north).toBeCloseTo(85.0511, 3)
    expect(south).toBeCloseTo(-85.0511, 3)
  })

  it('halves its span at each zoom level', () => {
    const [west, , east] = flatViewBounds([6.13, 45.9], 13, 0, 1000, 600)
    const [west14, , east14] = flatViewBounds([6.13, 45.9], 14, 0, 1000, 600)
    expect(east - west).toBeCloseTo(1000 / (512 * 2 ** 13) * 360)
    expect(east14 - west14).toBeCloseTo((east - west) / 2)
  })

  it('surrounds a rotated view', () => {
    const [west, south, east, north] = flatViewBounds([6.13, 45.9], 13, 90, 1000, 600)
    const [w, s, e, n] = flatViewBounds([6.13, 45.9], 13, 0, 600, 1000)
    expect([west, south, east, north].map(v => v.toFixed(6))).toEqual([w, s, e, n].map(v => v.toFixed(6)))
  })
})
