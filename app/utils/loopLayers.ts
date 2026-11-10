import type { FeatureCollection, LineString, Point } from 'geojson'
import type { ExpressionSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'
import { addMarkerImages } from '~/utils/mapMarkers'
import { isMapDark, mapColor } from '~/utils/topoStyle'

// Automatic loop proposals (#50), over the editor's layers (its track is hidden meanwhile).

// Categorical slots 1 to 3 of the dataviz palette, one per proposal, each mode's own steps, validated all-pairs on the
// map's background (light #f7f4ec, dark #141815 since #258, each a little more contrast than before; loops.md). The list beside the map names each one, so they read
// without the colours.
export const LOOP_COLORS = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
] as const

export const VIA_COLOR = '#1f2937'
// The climbs of a session's route (#266), in ink over the picked loop: the ink of each mode, so they read on the
// coloured line and on either map.
export const CLIMB_INK = { light: '#1d2520', dark: '#f3eee3' } as const

const LOOPS_SOURCE = 'loop-proposals'
const START_SOURCE = 'loop-start'
const CLIMBS_SOURCE = 'loop-climbs'
export const LOOPS_HIT_LAYER = 'loop-proposals-hit'

export interface LoopLayerData {
  start: LngLat | null
  // The place the proposals go through (#214)
  via: LngLat | null
  // Coordinates of each proposal, in list order (empty while loading or failed)
  loops: LngLat[][]
  highlighted: number | null
  // The climbs of the highlighted loop in the session mode (#266), each a stretch of it
  climbs?: LngLat[][]
}

// Rebuilt when the highlight changes: the highlighted loop goes last, so it is drawn above the others (three lines
// at most, while a feature state can't change the drawing order).
function loopsData({ loops, highlighted }: LoopLayerData): FeatureCollection<LineString> {
  const features = loops.flatMap((coordinates, index) => coordinates.length < 2
    ? []
    : [{
        type: 'Feature' as const,
        properties: { index, highlighted: index === highlighted, dimmed: highlighted !== null && index !== highlighted },
        geometry: { type: 'LineString' as const, coordinates },
      }])
  return { type: 'FeatureCollection', features: features.sort((a, b) => Number(a.properties.highlighted) - Number(b.properties.highlighted)) }
}

// The start, and the place to go through.
function startData(start: LngLat | null, via: LngLat | null): FeatureCollection<Point> {
  const points = [...(start ? [{ kind: 'start', coordinates: start }] : []), ...(via ? [{ kind: 'via', coordinates: via }] : [])]
  return {
    type: 'FeatureCollection',
    features: points.map(({ kind, coordinates }) => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Point', coordinates } })),
  }
}

function climbsData(climbs: LngLat[][] = []): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: climbs.filter(stretch => stretch.length >= 2).map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
  }
}

export function addLoopLayers(map: Map) {
  map.on('style.load', repaintLoops)
  map.addSource(LOOPS_SOURCE, { type: 'geojson', data: loopsData({ start: null, via: null, loops: [], highlighted: null }) })
  map.addSource(START_SOURCE, { type: 'geojson', data: startData(null, null) })
  map.addSource(CLIMBS_SOURCE, { type: 'geojson', data: climbsData() })

  map.addLayer({
    id: 'loop-proposals-casing',
    type: 'line',
    source: LOOPS_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': mapColor(map, 'casing'), 'line-width': ['case', ['get', 'highlighted'], 9, 7], 'line-opacity': ['case', ['get', 'dimmed'], 0.5, 1] },
  })
  map.addLayer({
    id: 'loop-proposals',
    type: 'line',
    source: LOOPS_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': loopColors(map), 'line-width': ['case', ['get', 'highlighted'], 6, 4], 'line-opacity': ['case', ['get', 'dimmed'], 0.5, 1] },
  })
  // Wider than the loop and squared off, like ruled stretches over it (mockup 3).
  map.addLayer({
    id: 'loop-climbs',
    type: 'line',
    source: CLIMBS_SOURCE,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': CLIMB_INK[isMapDark(map) ? 'dark' : 'light'], 'line-width': 8 },
  })
  map.addLayer({
    id: LOOPS_HIT_LAYER,
    type: 'line',
    source: LOOPS_SOURCE,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
  })
  // A ringed point, unlike the start and the waypoints.
  map.addLayer({
    id: 'loop-via',
    type: 'circle',
    source: START_SOURCE,
    filter: ['==', ['get', 'kind'], 'via'],
    paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': VIA_COLOR, 'circle-stroke-width': 3 },
  })
  // Same look as a route's start.
  addMarkerImages(map, ['sm-start'])
  map.addLayer({
    id: 'loop-start',
    type: 'symbol',
    source: START_SOURCE,
    filter: ['==', ['get', 'kind'], 'start'],
    layout: { 'icon-image': 'sm-start', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
  })
}

// The colours of the map's mode. Not in APP_MAP_COLORS: switchAppColors swaps colour literals in every app layer,
// and these are also the way info's and marked routes' colours. A theme change ends with a `style.load`.
function loopColors(map: Map): ExpressionSpecification {
  const mode = isMapDark(map) ? 'dark' : 'light'
  return ['match', ['get', 'index'], 0, LOOP_COLORS[0][mode], 1, LOOP_COLORS[1][mode], LOOP_COLORS[2][mode]]
}

function repaintLoops(this: void, event: { target: Map }) {
  if (event.target.getLayer('loop-proposals')) event.target.setPaintProperty('loop-proposals', 'line-color', loopColors(event.target))
  if (event.target.getLayer('loop-climbs')) event.target.setPaintProperty('loop-climbs', 'line-color', CLIMB_INK[isMapDark(event.target) ? 'dark' : 'light'])
}

export function setLoopLayerData(map: Map, data: LoopLayerData) {
  map.getSource<GeoJSONSource>(LOOPS_SOURCE)?.setData(loopsData(data))
  map.getSource<GeoJSONSource>(START_SOURCE)?.setData(startData(data.start, data.via))
  map.getSource<GeoJSONSource>(CLIMBS_SOURCE)?.setData(climbsData(data.climbs))
}
