import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { keepAppLayers, mapStyleDark, mapStyleUrl, mapStyleUrls, availableStyleUrl } from '~/utils/mapStyle'

describe('mapStyleUrl', () => {
  it('picks Outdoor or Outdoor Dark with a key', () => {
    expect(mapStyleUrl('k')).toBe('https://api.maptiler.com/maps/outdoor-v2/style.json?key=k')
    expect(mapStyleUrl('k', true)).toBe('https://api.maptiler.com/maps/outdoor-v2-dark/style.json?key=k')
  })

  it('falls back to the demo style, light or dark, without a key', () => {
    expect(mapStyleUrl('', true)).toBe(mapStyleUrl(''))
  })

  it('lists every style to prepare offline, once each', () => {
    expect(mapStyleUrls('k')).toEqual([mapStyleUrl('k'), mapStyleUrl('k', true)])
    expect(mapStyleUrls('')).toEqual([mapStyleUrl('')])
  })

  it('prepares only the chosen style when it does not follow the theme', () => {
    expect(mapStyleUrls('k', 'light')).toEqual([mapStyleUrl('k')])
    expect(mapStyleUrls('k', 'dark')).toEqual([mapStyleUrl('k', true)])
    expect(mapStyleUrls('', 'dark')).toEqual([mapStyleUrl('')])
  })
})

describe('mapStyleDark', () => {
  it('follows the theme or keeps the chosen style', () => {
    expect(mapStyleDark('theme', true)).toBe(true)
    expect(mapStyleDark('theme', false)).toBe(false)
    expect(mapStyleDark('light', true)).toBe(false)
    expect(mapStyleDark('dark', false)).toBe(true)
  })
})

describe('availableStyleUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  function offline(cached: string[]) {
    const caches = { match: async (url: string) => (cached.includes(url) ? new Response('{}') : undefined) }
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal('caches', caches)
    vi.stubGlobal('window', { caches })
  }

  it('keeps the dark style online', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(await availableStyleUrl('k', true)).toBe(mapStyleUrl('k', true))
  })

  it('keeps the dark style offline when it was prepared', async () => {
    offline([mapStyleUrl('k', true)])
    expect(await availableStyleUrl('k', true)).toBe(mapStyleUrl('k', true))
  })

  it('falls back to the light style offline when only it was prepared', async () => {
    offline([mapStyleUrl('k')])
    expect(await availableStyleUrl('k', true)).toBe(mapStyleUrl('k'))
  })

  it('falls back to the dark style offline when only it was prepared', async () => {
    offline([mapStyleUrl('k', true)])
    expect(await availableStyleUrl('k', false)).toBe(mapStyleUrl('k', true))
  })

  it('keeps the asked style offline when neither was prepared', async () => {
    offline([])
    expect(await availableStyleUrl('k', true)).toBe(mapStyleUrl('k', true))
  })
})

function style(layers: LayerSpecification[], sources: StyleSpecification['sources'] = {}): StyleSpecification {
  return { version: 8, sources, layers }
}

const tiles = { type: 'vector', url: 'https://tiles/tiles.json' } as const

describe('keepAppLayers', () => {
  const light = style([
    { id: 'background', type: 'background', paint: { 'background-color': '#eee' } },
    { id: 'water', type: 'fill', source: 'tiles', 'source-layer': 'water', paint: { 'fill-color': '#9cf' } },
    { id: 'road', type: 'line', source: 'tiles', 'source-layer': 'road', paint: { 'line-color': '#fff' } },
  ], { tiles })
  const dark = style([
    { id: 'background', type: 'background', paint: { 'background-color': '#222' } },
    { id: 'road', type: 'line', source: 'tiles', 'source-layer': 'road', paint: { 'line-color': '#555' } },
    { id: 'water', type: 'fill', source: 'tiles', 'source-layer': 'water', paint: { 'fill-color': '#135' } },
  ], { tiles })

  it('returns the next style when there is no previous one', () => {
    expect(keepAppLayers(undefined, dark)).toBe(dark)
  })

  it('keeps the app sources and layers above the next style, and its terrain', () => {
    const previous: StyleSpecification = {
      ...light,
      sources: { ...light.sources, track: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
      layers: [...light.layers, { id: 'track', type: 'line', source: 'track', paint: { 'line-color': '#f97316' } }],
      terrain: { source: 'dem', exaggeration: 1.5 },
    }
    const result = keepAppLayers(previous, dark)
    expect(result.layers.map(layer => layer.id)).toEqual(['background', 'road', 'water', 'track'])
    expect(result.sources).toEqual(previous.sources)
    expect(result.terrain).toEqual({ source: 'dem', exaggeration: 1.5 })
    expect(result.layers[1]).toMatchObject({ paint: { 'line-color': '#555' } })
  })

  it('keeps the style layers hidden under Plan IGN', () => {
    const previous = { ...light, layers: light.layers.map(layer => 'source' in layer ? { ...layer, layout: { visibility: 'none' as const } } : layer) }
    const result = keepAppLayers(previous, dark)
    expect(result.layers.map(layer => layer.layout?.visibility)).toEqual([undefined, 'none', 'none'])
    expect(result.terrain).toBeUndefined()
  })
})
