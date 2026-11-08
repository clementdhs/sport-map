import type { LayerSpecification, Map, StyleSpecification } from 'maplibre-gl'

// The "topo" look of the redesign (#226, #230): MapTiler Outdoor (outdoor-v2 and outdoor-v2-dark, loaded from the
// same URLs as before, so the same requests and the same offline caches) recoloured when MapLibre loads it, by layer
// id. Cream paper, pale green woods, marked contour lines, white roads cased in sand, blue-grey water, brown italic
// names of hills and places; "nuit topo" in dark mode. Layers it doesn't name (waymark colours, POI icons, borders…)
// keep MapTiler's colours, and a layer MapTiler renames or removes is simply left as MapTiler draws it.

export interface TopoPalette {
  background: string
  wood: string
  scrub: string
  grass: string
  sand: string
  glacier: string
  residential: string
  industrial: string
  cemetery: string
  hospital: string
  stadium: string
  park: string
  parkOutline: string
  aeroway: string
  pier: string
  contour: string
  contourIndex: string
  // Opacity of the contour lines and of the index (thicker, labelled) ones.
  contourOpacity: number
  contourIndexOpacity: number
  contourLabel: string
  water: string
  river: string
  waterLabel: string
  road: string
  roadCasing: string
  roadLabel: string
  path: string
  trailOutline: string
  building: string
  buildingOutline: string
  // Names of hills, hamlets and localities: brown italics.
  toponym: string
  // Villages, towns and cities: ink capitals.
  place: string
  muted: string
  halo: string
  hillshadeHighlight: string
  hillshadeShadow: string
  hillshadeAccent: string
}

export const TOPO_PALETTES: Record<'light' | 'dark', TopoPalette> = {
  light: {
    background: '#f7f4ec',
    wood: '#c9ddb0',
    scrub: '#dde5c4',
    grass: 'rgba(170, 205, 120, 0.3)',
    sand: '#ede3c5',
    glacier: '#ffffff',
    residential: 'rgba(200, 188, 165, 0.28)',
    industrial: '#ebe5d6',
    cemetery: '#d3dcbd',
    hospital: '#efdfd6',
    stadium: '#d8e4c0',
    park: 'rgba(170, 205, 135, 0.35)',
    parkOutline: '#a9c288',
    aeroway: '#e6e0d1',
    pier: '#ebe5d6',
    contour: '#bfa57a',
    contourIndex: '#a88b5c',
    contourOpacity: 0.5,
    contourIndexOpacity: 0.75,
    contourLabel: '#7a6544',
    water: '#9cc3d8',
    river: '#8db9d2',
    waterLabel: '#356179',
    road: '#ffffff',
    roadCasing: '#cdbfa4',
    roadLabel: '#3a423b',
    path: '#6e5a3e',
    trailOutline: 'rgba(247, 244, 236, 0.75)',
    building: '#d8ccb5',
    buildingOutline: '#c8b99c',
    toponym: '#5a4630',
    place: '#1d2520',
    muted: '#5b6158',
    halo: 'rgba(247, 244, 236, 0.9)',
    hillshadeHighlight: '#ffffff',
    hillshadeShadow: '#2e2a22',
    hillshadeAccent: '#bfa57a',
  },
  dark: {
    background: '#141815',
    wood: '#1d3024',
    scrub: '#1b261d',
    grass: 'rgba(62, 100, 66, 0.3)',
    sand: '#2c2b22',
    glacier: '#36404a',
    residential: 'rgba(70, 76, 68, 0.3)',
    industrial: '#1e2320',
    cemetery: '#1f2a21',
    hospital: '#2a2021',
    stadium: '#1f2b21',
    park: 'rgba(52, 96, 66, 0.3)',
    parkOutline: '#3a5c43',
    aeroway: '#222722',
    pier: '#222722',
    contour: '#5d6857',
    contourIndex: '#7c8770',
    contourOpacity: 0.45,
    contourIndexOpacity: 0.6,
    contourLabel: '#9da08b',
    water: '#23485a',
    river: '#2e6079',
    waterLabel: '#8fc0d4',
    road: '#454c44',
    roadCasing: '#0e110f',
    roadLabel: '#d6d0c0',
    path: '#c2b493',
    trailOutline: 'rgba(20, 24, 21, 0.75)',
    building: '#272d28',
    buildingOutline: '#353d36',
    toponym: '#c4b99d',
    place: '#ece6d6',
    muted: '#a8a797',
    halo: 'rgba(20, 24, 21, 0.9)',
    hillshadeHighlight: '#6a7765',
    hillshadeShadow: '#000000',
    hillshadeAccent: '#0b0e0c',
  },
}

// Font stacks the style already uses elsewhere (contour, lake and country labels): MapTiler serves their glyphs
// anyway, and the offline preparation already stores them (app/utils/offlineRoute.ts reads the raw style).
const ITALIC_MEDIUM = ['Roboto Medium Italic', 'Noto Sans Italic']
const ITALIC = ['Roboto Italic', 'Noto Sans Italic']
const BOLD = ['Roboto Bold', 'Noto Sans Bold']

// Added below MapTiler's "Road network": the sand edges of the roads, drawn with a gap as wide as the road.
export const ROAD_CASING_LAYER = 'Road network casing'

interface LayerOverride {
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
}

function overrides(p: TopoPalette): Record<string, LayerOverride> {
  const fill = (color: string): LayerOverride => ({ paint: { 'fill-color': color } })
  const line = (color: string): LayerOverride => ({ paint: { 'line-color': color } })
  const label = (color: string, extra: LayerOverride = {}): LayerOverride => ({
    paint: { 'text-color': color, 'text-halo-color': p.halo, ...extra.paint },
    layout: extra.layout,
  })
  const toponym: LayerOverride = label(p.toponym, {
    paint: { 'icon-color': p.toponym, 'icon-halo-color': p.halo },
    layout: { 'text-font': ITALIC_MEDIUM },
  })
  const place: LayerOverride = label(p.place, {
    paint: { 'icon-color': p.background, 'icon-halo-color': p.place },
    layout: { 'text-font': BOLD, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 },
  })
  const water = label(p.waterLabel, { paint: { 'icon-color': p.waterLabel } })
  return {
    'Background': { paint: { 'background-color': p.background } },
    'Scrub': fill(p.scrub),
    'Tree': fill(p.wood),
    'Forest': fill(p.wood),
    'Wood': fill(p.wood),
    'Grass': fill(p.grass),
    'Sand': fill(p.sand),
    'Glacier': fill(p.glacier),
    'Residential': fill(p.residential),
    'Industrial': fill(p.industrial),
    'Commercial': fill(p.industrial),
    'Cemetery': fill(p.cemetery),
    'Hospital': fill(p.hospital),
    'Stadium': fill(p.stadium),
    'Park': fill(p.park),
    'Park outline': line(p.parkOutline),
    'Aeroway': fill(p.aeroway),
    'Pier': fill(p.pier),
    'Hillshade': {
      paint: {
        'hillshade-highlight-color': p.hillshadeHighlight,
        'hillshade-shadow-color': p.hillshadeShadow,
        'hillshade-accent-color': p.hillshadeAccent,
      },
    },
    // Marked but see-through (#258): near-opaque lines veiled the paths and the relief shading.
    'Contour index': { paint: { 'line-color': p.contourIndex, 'line-opacity': p.contourIndexOpacity } },
    'Contour': {
      paint: {
        'line-color': p.contour,
        'line-opacity': ['step', ['zoom'], ['match', ['get', 'nth_line'], 0, 0, p.contourOpacity], 15, p.contourOpacity],
      },
    },
    'Contour labels': label(p.contourLabel, { paint: { 'icon-color': p.contourLabel } }),
    'River tunnel': line(p.river),
    'River': line(p.river),
    'Water': { paint: { 'fill-color': p.water } },
    'Road network': line(p.road),
    'Pedestrian outline': line(p.road),
    'Pedestrian': line(p.path),
    'Steps': line(p.path),
    'Track': line(p.path),
    'Path minor': line(p.path),
    'Path': line(p.path),
    'Other trails': line(p.path),
    'Trails outline': line(p.trailOutline),
    'Bicycle outline': line(p.trailOutline),
    'Longdistance trail outline': line(p.trailOutline),
    'Building': { paint: { 'fill-color': p.building, 'fill-outline-color': p.buildingOutline } },
    'Road labels': { paint: { 'text-color': p.roadLabel, 'text-halo-color': p.road } },
    'River labels': water,
    'Lakeline labels': water,
    'Ocean labels': water,
    'Sea labels': water,
    'Lake labels': water,
    'Peak labels': toponym,
    'Peak labels (US)': toponym,
    'Place labels': label(p.toponym, { layout: { 'text-font': ITALIC } }),
    'Village labels': place,
    'Town labels': place,
    'City labels': place,
    'State labels': label(p.muted),
    'Country labels': label(p.muted),
    'Continent labels': label(p.muted),
  }
}

function roadCasing(road: LayerSpecification, color: string): LayerSpecification | undefined {
  if (road.type !== 'line' || !road.paint?.['line-width']) return undefined
  return {
    ...road,
    id: ROAD_CASING_LAYER,
    paint: {
      'line-color': color,
      // Only once roads are wide enough to have edges.
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1, 18, 1.5],
      'line-gap-width': road.paint['line-width'],
    },
  }
}

// MapTiler Outdoor (light or dark) in the topo colours. A pure function of the fetched style, for
// `transformStyle` (app/components/map/MapView.vue): the light and dark versions keep the same layer ids, so a
// theme change stays a diff of colours.
export function topoStyle(style: StyleSpecification, dark: boolean): StyleSpecification {
  const palette = TOPO_PALETTES[dark ? 'dark' : 'light']
  const changes = overrides(palette)
  const layers: LayerSpecification[] = []
  for (const layer of style.layers) {
    if (layer.id === ROAD_CASING_LAYER) continue
    const change = changes[layer.id]
    const next = (change
      ? {
          ...layer,
          ...(change.paint ? { paint: { ...('paint' in layer ? layer.paint : {}), ...change.paint } } : {}),
          ...(change.layout ? { layout: { ...layer.layout, ...change.layout } } : {}),
        }
      : layer) as LayerSpecification
    if (layer.id === 'Road network') {
      const casing = roadCasing(next, palette.roadCasing)
      if (casing) layers.push(casing)
    }
    layers.push(next)
  }
  return { ...style, layers }
}

// Colours of what the app draws on its maps (tracks, their casing, markers), light first, then dark ("nuit topo").
// Layers are added with the colours of the map's style; when it changes, `switchAppColors` swaps them.
export const APP_MAP_COLORS = {
  track: { light: '#b8461f', dark: '#e07a4f' },
  // The part of the route already covered in follow mode (#235): darker in light mode, lighter on the dark paper,
  // so it stands out more than what is left either way.
  trackDone: { light: '#6e2a12', dark: '#f4ab88' },
  casing: { light: '#fffdf8', dark: '#141815' },
} as const

export type MapColorName = keyof typeof APP_MAP_COLORS

// Whether each map shows the dark style, set by MapView whenever it asks for a style.
const darkMaps = new WeakMap<Map, boolean>()

export function setMapDark(map: Map, dark: boolean) {
  darkMaps.set(map, dark)
}

export function isMapDark(map: Map): boolean {
  return darkMaps.get(map) ?? false
}

// A colour of APP_MAP_COLORS for this map's style.
export function mapColor(map: Map, name: MapColorName): string {
  return APP_MAP_COLORS[name][isMapDark(map) ? 'dark' : 'light']
}

function swapValue(value: unknown, swap: (text: string) => string): unknown {
  if (typeof value === 'string') return swap(value)
  if (Array.isArray(value)) return value.map(item => swapValue(item, swap))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, swapValue(item, swap)]))
  }
  return value
}

// One of the app's layers in the other mode's colours: every literal of APP_MAP_COLORS becomes this mode's, in its
// paint and layout (expressions included). Marker images keep their names and are redrawn (app/utils/mapMarkers.ts).
export function switchAppColors<T extends LayerSpecification>(layer: T, dark: boolean): T {
  const from = dark ? 'light' : 'dark'
  const to = dark ? 'dark' : 'light'
  const colors = new globalThis.Map<string, string>(Object.values(APP_MAP_COLORS).map(pair => [pair[from], pair[to]]))
  const swap = (text: string) => colors.get(text.toLowerCase()) ?? text
  const next = { ...layer }
  if ('paint' in layer && layer.paint) Object.assign(next, { paint: swapValue(layer.paint, swap) })
  if (layer.layout) Object.assign(next, { layout: swapValue(layer.layout, swap) })
  return next
}
