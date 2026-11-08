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

const LOOPS_SOURCE = 'loop-proposals'
const START_SOURCE = 'loop-start'
export const LOOPS_HIT_LAYER = 'loop-proposals-hit'

export interface LoopLayerData {
  start: LngLat | null
  // Coordinates of each proposal, in list order (empty while loading or failed)
  loops: LngLat[][]
  highlighted: number | null
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

function startData(start: LngLat | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: start ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: start } }] : [],
  }
}

export function addLoopLayers(map: Map) {
  map.on('style.load', repaintLoops)
  map.addSource(LOOPS_SOURCE, { type: 'geojson', data: loopsData({ start: null, loops: [], highlighted: null }) })
  map.addSource(START_SOURCE, { type: 'geojson', data: startData(null) })

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
  map.addLayer({
    id: LOOPS_HIT_LAYER,
    type: 'line',
    source: LOOPS_SOURCE,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
  })
  // Same look as a route's start.
  addMarkerImages(map, ['sm-start'])
  map.addLayer({
    id: 'loop-start',
    type: 'symbol',
    source: START_SOURCE,
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
}

export function setLoopLayerData(map: Map, data: LoopLayerData) {
  map.getSource<GeoJSONSource>(LOOPS_SOURCE)?.setData(loopsData(data))
  map.getSource<GeoJSONSource>(START_SOURCE)?.setData(startData(data.start))
}
