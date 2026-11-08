import { normalizePropertyExpression } from '@maplibre/maplibre-gl-style-spec'
import type { LayerSpecification, StylePropertySpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { OSM_PLACE_TYPES, type OsmPlaceType } from '#shared/utils/osmPlaces'
import { POI_TYPES, SPORT_TYPES, type PoiType } from '#shared/utils/routes'
import { SLOPE_CLASSES } from '#shared/utils/slopes'
import { DIFFICULTY_CLASSES, SURFACE_CLASSES } from '#shared/utils/wayInfo'
import { OSM_INCOMPLETE_DASHES, OSM_ROUTE_LINE } from '~/utils/osmRouteLayers'
import { endMarker, sportMarker, startMarker, viaMarker, type MarkerDrawing } from '~/utils/mapMarkers'
import { CASING_COLOR, GPS_COLOR, ROUTE_COLOR, ROUTE_DONE_COLOR } from '~/utils/routeLayers'
import { TOPO_PALETTES } from '~/utils/topoStyle'

// Map legend (#76): the app's own symbols, drawn from the constants that draw them on the map, and the symbols of
// the MapTiler basemap, read from its loaded style (Plan IGN has an official legend image instead).

export type LineCap = 'butt' | 'round' | 'square'

// A layer of a sample, as MapLibre draws it. Line dashes are in pixels, ready for SVG's stroke-dasharray.
export type LegendPart =
  | { type: 'line', color: string, width: number, opacity: number, cap: LineCap, dashes?: string }
  | { type: 'fill', color: string, opacity: number }

export interface LegendImage {
  src: string
  // CSS pixels
  width: number
  height: number
}

export type LegendSample =
  // Layers stacked bottom first: a casing under a line, dashes over it, a fill and its outline…
  | { kind: 'layers', parts: LegendPart[] }
  | { kind: 'circle', radius: number, color: string, opacity?: number, stroke?: string, strokeWidth?: number }
  // The GPS arrow, as drawn by addGpsLayers
  | { kind: 'arrow' }
  | { kind: 'poi', type: PoiType }
  | { kind: 'osmPlace', type: OsmPlaceType }
  | { kind: 'image', image: LegendImage }
  // One of the app's marker images, as app/utils/mapMarkers.ts draws it
  | { kind: 'marker', drawing: MarkerDrawing }

export interface LegendItem {
  // Translation key
  label: string
  samples: LegendSample[]
}

export interface LegendGroup {
  // Translation key
  title: string
  items: LegendItem[]
}

// MapLibre scales dashes by the line width, and keeps round or square caps within each dash, where SVG adds them
// on both of its ends.
export function svgDashes(dashes: number[], width: number, cap: LineCap): string {
  const capLength = cap === 'butt' ? 0 : width
  return dashes
    .map((length, i) => (i % 2 ? length * width + capLength : Math.max(length * width - capLength, 0.01)))
    .map(length => Math.round(length * 100) / 100)
    .join(' ')
}

// The app's tracks: a light casing under the line, 4.5 px on 8 for routes (and their colourings), 4 on 7 for GPS.
const casedLine = (color: string, width = 4.5, casing = 8): LegendSample => ({
  kind: 'layers',
  parts: [
    { type: 'line', color: CASING_COLOR, width: casing, opacity: 1, cap: 'round' },
    { type: 'line', color, width, opacity: 1, cap: 'round' },
  ],
})

const classItems = (classes: readonly { key: string, color: string }[], labels: string): LegendItem[] =>
  classes.map(({ key, color }) => ({ label: `${labels}.${key}`, samples: [casedLine(color)] }))

const osmLine = (dashes?: number[]): LegendSample => ({
  kind: 'layers',
  parts: [{
    type: 'line',
    color: OSM_ROUTE_LINE.color,
    width: OSM_ROUTE_LINE.width,
    opacity: OSM_ROUTE_LINE.opacity,
    cap: dashes ? 'butt' : 'round',
    dashes: dashes && svgDashes(dashes, OSM_ROUTE_LINE.width, 'butt'),
  }],
})

// The same whatever the basemap, over the light topo map's background (both basemaps are light ones).
export const APP_LEGEND_BACKGROUND = TOPO_PALETTES.light.background
export const APP_LEGEND: LegendGroup[] = [
  {
    title: 'mapLegend.app.routes',
    items: [
      { label: 'mapLegend.app.route', samples: [casedLine(ROUTE_COLOR)] },
      { label: 'mapLegend.app.routeDone', samples: [casedLine(ROUTE_DONE_COLOR)] },
      { label: 'mapLegend.app.start', samples: [{ kind: 'marker', drawing: startMarker('light') }] },
      { label: 'mapLegend.app.end', samples: [{ kind: 'marker', drawing: endMarker('light') }] },
      { label: 'mapLegend.app.waypoint', samples: [{ kind: 'marker', drawing: viaMarker('light', 1) }] },
      { label: 'mapLegend.app.routeStart', samples: SPORT_TYPES.map(sport => ({ kind: 'marker', drawing: sportMarker('light', sport) })) },
    ],
  },
  {
    title: 'route.pois',
    items: POI_TYPES.map(type => ({ label: `pois.${type}`, samples: [{ kind: 'poi', type }] })),
  },
  {
    title: 'mapLegend.app.osmPlaces',
    items: OSM_PLACE_TYPES.map(type => ({ label: `osmPlaces.types.${type}`, samples: [{ kind: 'osmPlace', type }] })),
  },
  {
    title: 'mapLegend.app.gps',
    items: [
      { label: 'mapLegend.app.position', samples: [{ kind: 'circle', radius: 8, color: GPS_COLOR, stroke: '#ffffff', strokeWidth: 3 }] },
      { label: 'mapLegend.app.heading', samples: [{ kind: 'arrow' }] },
      { label: 'mapLegend.app.accuracy', samples: [{ kind: 'circle', radius: 12, color: GPS_COLOR, opacity: 0.15 }] },
      { label: 'mapLegend.app.gpsTrack', samples: [casedLine(GPS_COLOR, 4, 7)] },
    ],
  },
  {
    title: 'mapLegend.app.osmRoutes',
    items: [
      { label: 'mapLegend.app.osmRoute', samples: [osmLine()] },
      { label: 'mapLegend.app.osmIncomplete', samples: [osmLine(OSM_INCOMPLETE_DASHES)] },
    ],
  },
  { title: 'mapLegend.app.slopes', items: classItems(SLOPE_CLASSES, 'slopes') },
  { title: 'mapLegend.app.surface', items: classItems(SURFACE_CLASSES, 'ways.surface') },
  { title: 'mapLegend.app.sac', items: classItems(DIFFICULTY_CLASSES.sac, 'ways.sac') },
  { title: 'mapLegend.app.mtb', items: classItems(DIFFICULTY_CLASSES.mtb, 'ways.mtb') },
]

// MapTiler publishes no legend for Outdoor: this list of its layers (ids of outdoor-v2) is ours. A sample stacks
// the layers drawing one kind of feature, bottom first, with the feature properties that pick its branch in the
// style's data expressions; an icon sample is a sprite image of a symbol layer. Whatever is missing from the
// loaded style is left out, so a change of MapTiler's only hides entries.
interface LayersSampleSource { layers: string[], properties?: Record<string, unknown> }
interface IconSampleSource { layer: string, icon: string }
type SampleSource = LayersSampleSource | IconSampleSource

interface ItemSource {
  label: string
  samples: SampleSource[]
}

const MARKED_TRAIL_COLORS = ['Red', 'Yellow', 'Blue', 'Green', 'Orange', 'Purple', 'Brown', 'Black']

const icon = (key: string, layer: string, image: string): ItemSource =>
  ({ label: `mapLegend.maptiler.${key}`, samples: [{ layer, icon: image }] })
const layers = (key: string, ...ids: string[]): ItemSource =>
  ({ label: `mapLegend.maptiler.${key}`, samples: [{ layers: ids }] })

export const MAPTILER_LEGEND: { title: string, items: ItemSource[] }[] = [
  {
    title: 'mapLegend.maptiler.paths',
    items: [
      // Tracks, paths and minor paths look the same in the style.
      layers('path', 'Path'),
      layers('pavedPath', 'Pedestrian outline', 'Pedestrian'),
      layers('steps', 'Steps'),
      layers('viaFerrata', 'Via ferrata outline', 'Via ferrata'),
    ],
  },
  {
    title: 'mapLegend.maptiler.markedTrails',
    items: [
      {
        label: 'mapLegend.maptiler.markedTrail',
        samples: MARKED_TRAIL_COLORS.map(color => ({ layers: ['Trails outline', `${color} trail`], properties: { color: color.toLowerCase() } })),
      },
      layers('longDistanceTrail', 'Longdistance trail outline', 'Longdistance trail'),
      { label: 'mapLegend.maptiler.cycleRoute', samples: [{ layers: ['Bicycle outline', 'Bicycle local'], properties: { network: 'lcn' } }] },
      { label: 'mapLegend.maptiler.longDistanceCycleRoute', samples: [{ layers: ['Bicycle outline', 'Bicycle longdistance'], properties: { network: 'ncn' } }] },
    ],
  },
  {
    title: 'mapLegend.maptiler.relief',
    items: [
      { label: 'mapLegend.maptiler.contour', samples: [{ layers: ['Contour'], properties: { nth_line: 1 } }] },
      { label: 'mapLegend.maptiler.contourIndex', samples: [{ layers: ['Contour index'], properties: { nth_line: 10 } }] },
      layers('cliff', 'Cliff line', 'Cliff'),
      { label: 'mapLegend.maptiler.glacier', samples: [{ layers: ['Glacier', 'Glacier contour index'], properties: { nth_line: 10, glacier: 1 } }] },
      icon('peak', 'Peak labels', 'triangle'),
    ],
  },
  {
    title: 'mapLegend.maptiler.landcover',
    items: [
      layers('forest', 'Wood'),
      layers('scrub', 'Scrub'),
      layers('grass', 'Grass'),
      layers('sand', 'Sand'),
      layers('water', 'Water'),
      layers('river', 'River'),
    ],
  },
  {
    title: 'mapLegend.maptiler.transport',
    items: [
      layers('railway', 'Major railway', 'Major railway dash'),
      layers('cableCar', 'Cable car', 'Cable car dash'),
      layers('chairLift', 'Chair lift', 'Chair lift dash'),
      layers('dragLift', 'Minor lift', 'Minor lift dash'),
      layers('border', 'Country border'),
    ],
  },
  {
    title: 'mapLegend.maptiler.places',
    items: [
      icon('hut', 'Outdoor', 'hut'),
      icon('shelter', 'Outdoor', 'shelter'),
      icon('viewpoint', 'Outdoor', 'viewpoint'),
      icon('guidepost', 'Outdoor', 'guidepost'),
      icon('drinkingWater', 'Outdoor water', 'drinking_water'),
      icon('spring', 'Outdoor water', 'spring'),
      icon('campsite', 'Tourism', 'campsite'),
      icon('picnicSite', 'Outdoor', 'picnic_site'),
      icon('parking', 'Transport', 'parking'),
      icon('castle', 'Castle', 'castle'),
    ],
  },
]

// Samples are drawn as the map shows them at this zoom, where paths and marked trails are drawn: at the current
// zoom, a legend opened on a whole country would show none of them.
export const LEGEND_ZOOM = 16

const evaluated = { interpolated: true, parameters: ['zoom', 'feature'] as ('zoom' | 'feature')[] }
const SPECS = {
  color: { 'type': 'color', 'property-type': 'data-driven', 'expression': evaluated, 'transition': false, 'overridable': false, 'default': '#000000' },
  number: { 'type': 'number', 'property-type': 'data-driven', 'expression': evaluated, 'transition': false, 'default': 1 },
  dashes: { 'type': 'array', 'value': 'number', 'property-type': 'data-driven', 'expression': { ...evaluated, interpolated: false }, 'transition': false },
  cap: { 'type': 'enum', 'values': { butt: {}, round: {}, square: {} }, 'property-type': 'data-driven', 'expression': { ...evaluated, interpolated: false }, 'transition': false, 'default': 'butt' },
} satisfies Record<string, StylePropertySpecification>

// The value of a paint or layout property at LEGEND_ZOOM, or its default when the style leaves it out. Colours
// come out as "rgba(r,g,b,a)".
function evaluate(value: unknown, spec: StylePropertySpecification, properties: Record<string, unknown> = {}): unknown {
  return normalizePropertyExpression((value ?? spec.default) as never, 'legend', spec)
    .evaluate({ zoom: LEGEND_ZOOM }, { type: 'LineString', properties })
}

const colorOf = (value: unknown) => String(value)
const lineCap = (value: unknown): LineCap => (value === 'round' || value === 'square' ? value : 'butt')

function layerPart(layer: LayerSpecification, properties?: Record<string, unknown>): LegendPart | undefined {
  if (layer.type === 'line') {
    const paint = layer.paint ?? {}
    const width = Number(evaluate(paint['line-width'], SPECS.number, properties))
    const opacity = Number(evaluate(paint['line-opacity'], SPECS.number, properties))
    if (!(width > 0 && opacity > 0)) return undefined
    const cap = lineCap(evaluate(layer.layout?.['line-cap'], SPECS.cap, properties))
    const dashes = evaluate(paint['line-dasharray'], SPECS.dashes, properties)
    return {
      type: 'line',
      color: colorOf(evaluate(paint['line-color'], SPECS.color, properties)),
      width,
      opacity,
      cap,
      dashes: Array.isArray(dashes) ? svgDashes(dashes.map(Number), width, cap) : undefined,
    }
  }
  if (layer.type === 'fill') {
    const paint = layer.paint ?? {}
    const opacity = Number(evaluate(paint['fill-opacity'], SPECS.number, properties))
    if (!(opacity > 0)) return undefined
    return { type: 'fill', color: colorOf(evaluate(paint['fill-color'], SPECS.color, properties)), opacity }
  }
  return undefined
}

// How a symbol layer draws its icons. Icon opacity is left out: at LEGEND_ZOOM it hides some of them, which the
// map shows closer.
export interface IconPaint {
  color: string
  haloColor: string
  haloWidth: number
  haloBlur: number
  size: number
}

function iconPaint(layer: LayerSpecification): IconPaint | undefined {
  if (layer.type !== 'symbol') return undefined
  const paint = layer.paint ?? {}
  return {
    color: colorOf(evaluate(paint['icon-color'], SPECS.color)),
    haloColor: colorOf(evaluate(paint['icon-halo-color'], { ...SPECS.color, default: 'rgba(0, 0, 0, 0)' })),
    haloWidth: Number(evaluate(paint['icon-halo-width'], { ...SPECS.number, default: 0 })),
    haloBlur: Number(evaluate(paint['icon-halo-blur'], { ...SPECS.number, default: 0 })),
    size: Number(evaluate(layer.layout?.['icon-size'], SPECS.number)),
  }
}

export interface BasemapLegend {
  // The style's background at LEGEND_ZOOM, behind every sample
  background: string
  groups: LegendGroup[]
}

// The MapTiler part of the legend, from the loaded style. `icon` draws a sprite image as the layer paints it, or
// gives nothing when the style has no image by that name.
export function maptilerLegend(
  style: StyleSpecification | undefined,
  icon: (id: string, paint: IconPaint) => LegendImage | undefined,
): BasemapLegend {
  const byId = new Map((style?.layers ?? []).map(layer => [layer.id, layer]))
  // A sample needs all its layers: one missing, or that can't be evaluated (unknown expression), leaves it out. A
  // layer invisible at LEGEND_ZOOM only drops its part.
  const sample = (source: SampleSource): LegendSample | undefined => {
    try {
      if ('icon' in source) {
        // The layer must still draw that image.
        const layer = byId.get(source.layer)
        const usesIcon = layer?.type === 'symbol' && JSON.stringify(layer.layout?.['icon-image'] ?? '').includes(`"${source.icon}"`)
        const paint = usesIcon && layer ? iconPaint(layer) : undefined
        const image = paint && icon(source.icon, paint)
        return image && { kind: 'image', image }
      }
      const layers = source.layers.map(id => byId.get(id))
      if (layers.some(layer => !layer)) return undefined
      const parts = layers.map(layer => layerPart(layer!, source.properties)).filter(part => part !== undefined)
      return parts.length ? { kind: 'layers', parts } : undefined
    }
    catch {
      return undefined
    }
  }

  const background = (style?.layers ?? []).find(layer => layer.type === 'background')
  let backgroundColor = '#ffffff'
  try {
    if (background?.paint?.['background-color'] !== undefined) {
      backgroundColor = colorOf(evaluate(background.paint['background-color'], SPECS.color))
    }
  }
  catch { /* unreadable: white */ }

  const groups = MAPTILER_LEGEND
    .map(({ title, items }) => ({
      title,
      items: items
        .map(({ label, samples }) => ({ label, samples: samples.map(sample).filter(value => value !== undefined) }))
        .filter(item => item.samples.length),
    }))
    .filter(group => group.items.length)
  return { background: backgroundColor, groups }
}

function rgba(color: string): [number, number, number, number] {
  const [r = 0, g = 0, b = 0, a = 1] = color.match(/[\d.]+/g)?.map(Number) ?? []
  return [r, g, b, a]
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

// Colours an SDF icon (its alpha holds the distance to the shape's edge) as MapLibre's symbol shader does: the halo,
// then the icon over it. Returns RGBA pixels, not premultiplied.
export function paintSdf(pixels: Uint8Array | Uint8ClampedArray, paint: IconPaint): Uint8ClampedArray<ArrayBuffer> {
  const SDF_PX = 8
  const EDGE_GAMMA = 0.105
  const fill = rgba(paint.color)
  const halo = rgba(paint.haloColor)
  const gamma = EDGE_GAMMA / paint.size
  const haloGamma = (paint.haloBlur * 1.19 / SDF_PX + EDGE_GAMMA) / paint.size
  const haloEdge = (6 - paint.haloWidth / paint.size) / SDF_PX
  const out = new Uint8ClampedArray(pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    const distance = pixels[i + 3]! / 255
    const fillAlpha = smoothstep(0.75 - gamma, 0.75 + gamma, distance) * fill[3]
    const haloAlpha = paint.haloWidth > 0 ? smoothstep(haloEdge - haloGamma, haloEdge + haloGamma, distance) * halo[3] : 0
    const alpha = fillAlpha + haloAlpha * (1 - fillAlpha)
    for (let c = 0; c < 3; c++) {
      out[i + c] = alpha ? (fill[c]! * fillAlpha + halo[c]! * haloAlpha * (1 - fillAlpha)) / alpha : 0
    }
    out[i + 3] = alpha * 255
  }
  return out
}

// A sprite image of the map as a data URL, painted and sized as `paint` draws it.
export function spriteImage(map: MapLibreMap, id: string, paint: IconPaint): LegendImage | undefined {
  const image = map.getImage(id) as ReturnType<MapLibreMap['getImage']> | undefined
  if (!image?.data) return undefined
  const { width, height, data } = image.data
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const pixels = image.sdf ? paintSdf(data, paint) : new Uint8ClampedArray(data)
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0)
  const scale = paint.size / image.pixelRatio
  return { src: canvas.toDataURL(), width: width * scale, height: height * scale }
}
