import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import fr from '../../i18n/locales/fr.json'
import { SLOPE_CLASSES } from '#shared/utils/slopes'
import { CASING_COLOR } from '~/utils/routeLayers'
import { APP_LEGEND, MAPTILER_LEGEND, maptilerLegend, paintSdf, svgDashes } from '~/utils/mapLegend'
import type { IconPaint, LegendGroup, LegendImage } from '~/utils/mapLegend'

// A few layers of MapTiler Outdoor (outdoor-v2), as its style.json gives them.
const OUTDOOR: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'Background', type: 'background', paint: { 'background-color': ['interpolate', ['exponential', 1], ['zoom'], 5, 'hsl(86, 39%, 93%)', 14, 'hsl(120, 4%, 95%)'] } },
    { id: 'Water', type: 'fill', source: 'maptiler_planet', 'source-layer': 'water', paint: { 'fill-color': 'hsl(206, 78%, 80%)', 'fill-opacity': ['match', ['get', 'intermittent'], 1, 0.85, 1] } },
    { id: 'Contour index', type: 'line', source: 'contours', 'source-layer': 'contour', paint: { 'line-color': 'hsla(36, 45%, 45%, 0.8)', 'line-opacity': ['interpolate', ['exponential', 1], ['zoom'], 9, 0.3, 14, 0.4, 18, 0.5], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 1.5] } },
    { id: 'Contour', type: 'line', source: 'contours', 'source-layer': 'contour', paint: { 'line-color': 'hsl(36, 45%, 50%)', 'line-opacity': ['step', ['zoom'], ['match', ['get', 'nth_line'], 0, 0, 0.3], 15, 0.3], 'line-width': 0.8 } },
    { id: 'Path', type: 'line', source: 'maptiler_planet', 'source-layer': 'transportation', layout: { 'line-join': 'round' }, paint: { 'line-color': 'hsl(24, 10%, 60%)', 'line-dasharray': [5, 2], 'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 13, 0.5, 16, 1, 20, 2] } },
    { id: 'Major railway', type: 'line', source: 'maptiler_planet', 'source-layer': 'transportation', paint: { 'line-color': 'hsl(0, 0%, 50%)', 'line-width': ['interpolate', ['exponential', 1], ['zoom'], 8, 0.5, 10, 2, 14, 1.5, 16, 4] } },
    { id: 'Major railway dash', type: 'line', source: 'maptiler_planet', 'source-layer': 'transportation', paint: { 'line-color': 'hsl(0, 0%, 96%)', 'line-dasharray': ['step', ['zoom'], ['literal', [2, 2]], 9, ['literal', [2.5, 3]]], 'line-width': ['interpolate', ['exponential', 1], ['zoom'], 8, 0, 9, 0.5, 14, 1, 16, 4] } },
    { id: 'Trails outline', type: 'line', source: 'maptiler_planet', 'source-layer': 'trail', layout: { 'line-cap': 'round' }, paint: { 'line-color': 'hsla(0, 0%, 100%, 0.75)', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['case', ['==', ['get', 'color'], null], 0, 2], 18, ['case', ['==', ['get', 'color'], null], 4, 8]] } },
    { id: 'Blue trail', type: 'line', source: 'maptiler_planet', 'source-layer': 'trail', layout: { 'line-cap': 'round' }, paint: { 'line-color': 'hsl(217, 71%, 51%)', 'line-width': 2.5 } },
    { id: 'Red trail', type: 'line', source: 'maptiler_planet', 'source-layer': 'trail', layout: { 'line-cap': 'round' }, paint: { 'line-color': 'hsl(10, 100%, 50%)', 'line-width': 2.5 } },
    { id: 'Peak labels', type: 'symbol', source: 'maptiler_planet', 'source-layer': 'mountain_peak', layout: { 'icon-image': 'triangle', 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 14, 0.8] }, paint: { 'icon-color': 'hsl(23, 57%, 24%)', 'icon-halo-blur': 0.2, 'icon-halo-color': 'hsl(0, 0%, 100%)', 'icon-halo-width': 1.5 } },
  ],
}

const NO_ICON = () => undefined
const item = (groups: LegendGroup[], label: string) => groups.flatMap(group => group.items).find(entry => entry.label === label)

describe('svgDashes', () => {
  it('scales dashes by the line width', () => {
    expect(svgDashes([5, 2], 1, 'butt')).toBe('5 2')
    expect(svgDashes([2, 1.5], 3, 'butt')).toBe('6 4.5')
  })

  it('keeps round caps within each dash, as MapLibre does', () => {
    expect(svgDashes([3, 2], 2, 'round')).toBe('4 6')
    // Shorter than the cap: a dot.
    expect(svgDashes([0.5, 2], 2, 'round')).toBe('0.01 6')
  })
})

describe('maptilerLegend', () => {
  it('draws each entry with the paint of its layers at the legend zoom', () => {
    const { background, groups } = maptilerLegend(OUTDOOR, NO_ICON)
    expect(background).toBe('rgba(242,243,242,1)')
    expect(item(groups, 'mapLegend.maptiler.path')?.samples).toEqual([{
      kind: 'layers',
      parts: [{ type: 'line', color: 'rgba(163,151,143,1)', width: 1, opacity: 1, cap: 'butt', dashes: '5 2' }],
    }])
    // Stacked layers, with zoom steps.
    expect(item(groups, 'mapLegend.maptiler.railway')?.samples).toEqual([{
      kind: 'layers',
      parts: [
        { type: 'line', color: 'rgba(128,128,128,1)', width: 4, opacity: 1, cap: 'butt', dashes: undefined },
        { type: 'line', color: 'rgba(245,245,245,1)', width: 4, opacity: 1, cap: 'butt', dashes: '10 12' },
      ],
    }])
    expect(item(groups, 'mapLegend.maptiler.water')?.samples).toEqual([{ kind: 'layers', parts: [{ type: 'fill', color: 'rgba(164,209,244,1)', opacity: 1 }] }])
  })

  it('picks the branch of data expressions with the entry\'s feature properties', () => {
    const { groups } = maptilerLegend(OUTDOOR, NO_ICON)
    const contour = item(groups, 'mapLegend.maptiler.contour')?.samples[0]
    expect(contour).toMatchObject({ parts: [{ opacity: 0.3, width: 0.8 }] })
    // One sample per waymark colour the style has, over the outline those colours get.
    const trails = item(groups, 'mapLegend.maptiler.markedTrail')?.samples
    expect(trails).toHaveLength(2)
    expect(trails?.[0]).toEqual({
      kind: 'layers',
      parts: [
        { type: 'line', color: 'rgba(255,255,255,0.75)', width: expect.closeTo(6.29, 2), opacity: 1, cap: 'round', dashes: undefined },
        { type: 'line', color: 'rgba(255,43,0,1)', width: 2.5, opacity: 1, cap: 'round', dashes: undefined },
      ],
    })
  })

  it('leaves out what the style lacks, and icons without a sprite image', () => {
    const { groups } = maptilerLegend(OUTDOOR, NO_ICON)
    expect(item(groups, 'mapLegend.maptiler.viaFerrata')).toBeUndefined()
    expect(item(groups, 'mapLegend.maptiler.peak')).toBeUndefined()
    expect(groups.map(group => group.title)).not.toContain('mapLegend.maptiler.places')

    const triangle: LegendImage = { src: 'data:image/png;base64,', width: 12, height: 10 }
    const painted: [string, IconPaint][] = []
    const icons = (id: string, paint: IconPaint) => {
      painted.push([id, paint])
      return id === 'triangle' ? triangle : undefined
    }
    expect(item(maptilerLegend(OUTDOOR, icons).groups, 'mapLegend.maptiler.peak')?.samples).toEqual([{ kind: 'image', image: triangle }])
    // Drawn with the layer's paint.
    expect(painted).toEqual([['triangle', { color: 'rgba(96,53,26,1)', haloColor: 'rgba(255,255,255,1)', haloWidth: 1.5, haloBlur: 0.2, size: 0.8 }]])
    // Not when the layer draws another image now.
    const restyled: StyleSpecification = { ...OUTDOOR, layers: OUTDOOR.layers.map(layer => (layer.id === 'Peak labels' ? { ...layer, layout: { 'icon-image': 'mountain' } } as typeof layer : layer)) }
    expect(item(maptilerLegend(restyled, icons).groups, 'mapLegend.maptiler.peak')).toBeUndefined()
  })

  it('shows nothing for a style without MapTiler\'s layers, as in the e2e tests', () => {
    expect(maptilerLegend({ version: 8, sources: {}, layers: [] }, NO_ICON)).toEqual({ background: '#ffffff', groups: [] })
    expect(maptilerLegend(undefined, NO_ICON).groups).toEqual([])
  })

  it('leaves out a layer it can\'t evaluate', () => {
    const style: StyleSpecification = {
      ...OUTDOOR,
      layers: [{ id: 'Path', type: 'line', source: 'maptiler_planet', paint: { 'line-color': ['get'] as never } }],
    }
    expect(maptilerLegend(style, NO_ICON).groups).toEqual([])
  })
})

describe('paintSdf', () => {
  const paint: IconPaint = { color: 'rgba(255,0,0,1)', haloColor: 'rgba(255,255,255,1)', haloWidth: 3, haloBlur: 0, size: 1 }
  // One pixel per distance to the edge: inside the shape, in its halo, outside both.
  const pixels = (...distances: number[]) => new Uint8Array(distances.flatMap(distance => [0, 0, 0, distance]))

  it('paints the shape in the icon colour over a halo, as MapLibre does', () => {
    expect([...paintSdf(pixels(255, 153, 0), paint)]).toEqual([255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0])
  })

  it('draws no halo without a halo width', () => {
    expect([...paintSdf(pixels(153), { ...paint, haloWidth: 0 })]).toEqual([0, 0, 0, 0])
  })
})

describe('legends', () => {
  it('draws the track colourings with the route page\'s classes', () => {
    const slopes = APP_LEGEND.find(group => group.title === 'mapLegend.app.slopes')!
    expect(slopes.items.map(({ samples }) => samples[0])).toEqual(SLOPE_CLASSES.map(({ color }) => expect.objectContaining({
      parts: [expect.objectContaining({ color: CASING_COLOR }), expect.objectContaining({ color })],
    })))
  })

  it('has a French message for every title and label', () => {
    const message = (key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], fr)
    const keys = [...APP_LEGEND, ...MAPTILER_LEGEND].flatMap(group => [group.title, ...group.items.map(entry => entry.label)])
    expect(keys.filter(key => typeof message(key) !== 'string')).toEqual([])
  })
})
