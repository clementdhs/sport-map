import { describe, expect, it } from 'vitest'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { mapStyleTransform } from '~/utils/mapStyle'
import { APP_MAP_COLORS, ROAD_CASING_LAYER, switchAppColors, TOPO_PALETTES, topoStyle } from '~/utils/topoStyle'
import { contrast } from './contrast'

// A few layers of MapTiler Outdoor (outdoor-v2), as its style.json gives them.
const ROAD_WIDTH = ['interpolate', ['linear', 1], ['zoom'], 5, 0, 16, ['match', ['get', 'class'], 'motorway', 10, 3]]
const OUTDOOR = {
  version: 8,
  sources: { maptiler_planet: { type: 'vector', url: 'https://api.maptiler.com/tiles/v3/tiles.json?key=k' } },
  layers: [
    { id: 'Background', type: 'background', paint: { 'background-color': 'hsl(86, 39%, 93%)' } },
    { id: 'Wood', type: 'fill', source: 'maptiler_planet', 'source-layer': 'landcover', paint: { 'fill-color': 'hsl(90, 39%, 80%)', 'fill-opacity': 0.8 } },
    { id: 'Road network', type: 'line', source: 'maptiler_planet', 'source-layer': 'transportation', minzoom: 5, filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round' }, paint: { 'line-color': 'hsl(0, 100%, 100%)', 'line-width': ROAD_WIDTH } },
    { id: 'Yellow trail', type: 'line', source: 'maptiler_planet', 'source-layer': 'trail', paint: { 'line-color': 'hsl(58, 100%, 50%)' } },
    { id: 'Peak labels', type: 'symbol', source: 'maptiler_planet', 'source-layer': 'mountain_peak', layout: { 'text-field': '{name}', 'text-font': ['Roboto Condensed Regular', 'Noto Sans Regular'], 'icon-image': 'triangle' }, paint: { 'text-color': 'hsl(23, 57%, 24%)', 'icon-color': 'hsl(23, 57%, 24%)' } },
    { id: 'Village labels', type: 'symbol', source: 'maptiler_planet', 'source-layer': 'place', layout: { 'text-field': '{name}', 'text-transform': 'none', 'text-size': 12 }, paint: { 'text-color': 'hsl(240, 6%, 13%)' } },
  ],
} as StyleSpecification

const layer = (style: StyleSpecification, id: string) => style.layers.find(item => item.id === id) as LayerSpecification & { paint: Record<string, unknown>, layout?: Record<string, unknown> }

describe('topoStyle', () => {
  it('paints the background, woods and roads in the topo colours, light and dark', () => {
    for (const dark of [false, true]) {
      const palette = TOPO_PALETTES[dark ? 'dark' : 'light']
      const style = topoStyle(OUTDOOR, dark)
      expect(layer(style, 'Background').paint['background-color']).toBe(palette.background)
      expect(layer(style, 'Wood').paint).toEqual({ 'fill-color': palette.wood, 'fill-opacity': 0.8 })
      expect(layer(style, 'Road network').paint['line-color']).toBe(palette.road)
    }
  })

  // #258: the first topo tint veiled the map (paths, woods and relief too close to the paper).
  it('keeps paths readable on the paper and in the woods, and contour lines see-through, light and dark', () => {
    for (const palette of Object.values(TOPO_PALETTES)) {
      expect(contrast(palette.path, palette.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.path, palette.wood)).toBeGreaterThanOrEqual(3)
      expect(contrast(palette.wood, palette.background)).toBeGreaterThanOrEqual(1.2)
      expect(palette.contourOpacity).toBeLessThanOrEqual(0.5)
      expect(palette.contourIndexOpacity).toBeLessThanOrEqual(0.75)
    }
  })

  it('draws the contour lines and rivers with the palette', () => {
    const style = topoStyle({
      ...OUTDOOR,
      layers: [
        { id: 'Contour index', type: 'line', source: 'maptiler_planet', 'source-layer': 'contour', paint: { 'line-color': 'hsla(36, 45%, 45%, 0.8)', 'line-width': 1 } },
        { id: 'Contour', type: 'line', source: 'maptiler_planet', 'source-layer': 'contour', paint: { 'line-color': 'hsl(36, 45%, 50%)' } },
        { id: 'River', type: 'line', source: 'maptiler_planet', 'source-layer': 'waterway', paint: { 'line-color': 'hsl(205, 56%, 73%)' } },
      ],
    } as StyleSpecification, false)
    const { contour, contourIndex, contourOpacity, contourIndexOpacity, river } = TOPO_PALETTES.light
    expect(layer(style, 'Contour index').paint).toEqual({ 'line-color': contourIndex, 'line-opacity': contourIndexOpacity, 'line-width': 1 })
    expect(layer(style, 'Contour').paint).toEqual({
      'line-color': contour,
      'line-opacity': ['step', ['zoom'], ['match', ['get', 'nth_line'], 0, 0, contourOpacity], 15, contourOpacity],
    })
    expect(layer(style, 'River').paint['line-color']).toBe(river)
  })

  it('cases the roads in sand, just below them, with a gap as wide as the road', () => {
    const style = topoStyle(OUTDOOR, false)
    const ids = style.layers.map(item => item.id)
    expect(ids.indexOf(ROAD_CASING_LAYER)).toBe(ids.indexOf('Road network') - 1)
    const casing = layer(style, ROAD_CASING_LAYER)
    expect(casing).toMatchObject({ type: 'line', source: 'maptiler_planet', 'source-layer': 'transportation', minzoom: 5, filter: ['==', ['geometry-type'], 'LineString'] })
    expect(casing.paint['line-color']).toBe(TOPO_PALETTES.light.roadCasing)
    expect(casing.paint['line-gap-width']).toEqual(ROAD_WIDTH)
  })

  it('sets brown italics on hills and ink capitals on places', () => {
    const style = topoStyle(OUTDOOR, false)
    expect(layer(style, 'Peak labels').layout).toMatchObject({ 'text-font': ['Roboto Medium Italic', 'Noto Sans Italic'], 'icon-image': 'triangle' })
    expect(layer(style, 'Peak labels').paint['text-color']).toBe(TOPO_PALETTES.light.toponym)
    expect(layer(style, 'Village labels').layout).toMatchObject({ 'text-transform': 'uppercase', 'text-size': 12 })
    expect(layer(style, 'Village labels').paint['text-color']).toBe(TOPO_PALETTES.light.place)
  })

  it('keeps the waymark colours, the sources and the input as they are', () => {
    const before = JSON.stringify(OUTDOOR)
    const style = topoStyle(OUTDOOR, true)
    expect(layer(style, 'Yellow trail')).toBe(layer(OUTDOOR, 'Yellow trail'))
    expect(style.sources).toBe(OUTDOOR.sources)
    expect(JSON.stringify(OUTDOOR)).toBe(before)
  })

  it('gives light and dark the same layer ids, and adds the casing once', () => {
    const light = topoStyle(OUTDOOR, false)
    const dark = topoStyle(light, true)
    expect(dark.layers.map(item => item.id)).toEqual(light.layers.map(item => item.id))
    expect(dark.layers.filter(item => item.id === ROAD_CASING_LAYER)).toHaveLength(1)
  })

  it('paints a layer MapTiler left in its default colours', () => {
    const bare = { ...OUTDOOR, layers: [{ id: 'Background', type: 'background' }] } as StyleSpecification
    expect(layer(topoStyle(bare, false), 'Background').paint).toEqual({ 'background-color': TOPO_PALETTES.light.background })
  })

  it('leaves a style without Outdoor\'s layers alone', () => {
    const demo = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } }] } as StyleSpecification
    expect(topoStyle(demo, true).layers).toEqual(demo.layers)
  })
})

describe('switchAppColors', () => {
  const track: LayerSpecification = {
    id: 'route-line',
    type: 'line',
    source: 'route-line',
    paint: { 'line-color': APP_MAP_COLORS.track.light, 'line-opacity': ['case', ['get', 'dimmed'], 0.5, 1] },
  }
  it('turns the light colours dark, and back', () => {
    const dark = switchAppColors(track, true)
    expect(dark.paint).toEqual({ 'line-color': APP_MAP_COLORS.track.dark, 'line-opacity': ['case', ['get', 'dimmed'], 0.5, 1] })
    expect(switchAppColors(dark, false)).toEqual(track)
  })

  it('changes nothing already in that mode, nor other colours', () => {
    expect(switchAppColors(track, false)).toEqual(track)
    const gps = { ...track, paint: { 'line-color': '#2563eb' } } as LayerSpecification
    expect(switchAppColors(gps, true)).toEqual(gps)
  })
})

describe('mapStyleTransform', () => {
  it('recolours MapTiler\'s style and the app\'s layers for the new mode', () => {
    const shown = topoStyle(OUTDOOR, false)
    const previous = { ...shown, layers: [...shown.layers, { id: 'route-line', type: 'line', source: 'route-line', paint: { 'line-color': APP_MAP_COLORS.track.light } }] } as StyleSpecification
    const next = mapStyleTransform('k', true)(previous, OUTDOOR)
    expect(layer(next, 'Background').paint['background-color']).toBe(TOPO_PALETTES.dark.background)
    expect(layer(next, 'route-line').paint['line-color']).toBe(APP_MAP_COLORS.track.dark)
  })

  it('leaves the demo style as it is without a key', () => {
    expect(mapStyleTransform('', false)(undefined, OUTDOOR)).toBe(OUTDOOR)
  })
})
