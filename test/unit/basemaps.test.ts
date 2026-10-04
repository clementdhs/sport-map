import { describe, expect, it } from 'vitest'
import type { Map } from 'maplibre-gl'
import { addBasemapLayers, DEFAULT_BASEMAP, parseBasemap, shownBasemap } from '~/utils/basemaps'

describe('parseBasemap', () => {
  it('keeps a known basemap', () => {
    expect(parseBasemap('ignPlan')).toBe('ignPlan')
    expect(parseBasemap('maptiler')).toBe('maptiler')
  })

  it('falls back to the default', () => {
    expect(parseBasemap(null)).toBe(DEFAULT_BASEMAP)
    expect(parseBasemap('scan25')).toBe(DEFAULT_BASEMAP)
  })
})

describe('shownBasemap', () => {
  it('shows the chosen basemap online, MapTiler offline', () => {
    expect(shownBasemap('ignPlan', true)).toBe('ignPlan')
    expect(shownBasemap('ignPlan', false)).toBe('maptiler')
  })
})

// The parts of a MapLibre map the basemap layers use, with the visibility of each layer.
function fakeMap() {
  const visibility: Record<string, string> = {}
  const layers = [
    { id: 'Background', type: 'background' },
    { id: 'Water', type: 'fill', source: 'maptiler_planet' },
    { id: 'Hillshade', type: 'hillshade', source: 'terrain-rgb' },
    { id: 'Cycle', type: 'line', source: 'outdoor', layout: { visibility: 'none' } },
  ]
  const added: string[] = []
  const map = {
    getStyle: () => ({ layers }),
    addSource: () => {},
    addLayer: (layer: { id: string, layout: { visibility: string } }) => {
      added.push(layer.id)
      visibility[layer.id] = layer.layout.visibility
    },
    setLayoutProperty: (id: string, _name: string, value: string) => {
      visibility[id] = value
    },
  }
  return { map: map as unknown as Map, visibility, added }
}

describe('addBasemapLayers', () => {
  it('adds a hidden Plan IGN layer', () => {
    const { map, visibility, added } = fakeMap()
    addBasemapLayers(map)
    expect(added).toEqual(['ign-plan'])
    expect(visibility['ign-plan']).toBe('none')
  })

  it('swaps the style layers for Plan IGN and back, keeping the background and hidden layers', () => {
    const { map, visibility } = fakeMap()
    const setBasemap = addBasemapLayers(map)

    setBasemap('ignPlan')
    expect(visibility).toEqual({ 'ign-plan': 'visible', 'Water': 'none', 'Hillshade': 'none' })

    setBasemap('maptiler')
    expect(visibility).toEqual({ 'ign-plan': 'none', 'Water': 'visible', 'Hillshade': 'visible' })
  })
})
