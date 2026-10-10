import type { FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'
import { START_COLOR } from '~/utils/routeLayers'

// Automatic loop proposals (#50), over the editor's layers (its track is hidden meanwhile).

// Categorical slots 1 to 3 of the dataviz palette (validated all-pairs on the light and dark surfaces), one per
// proposal; the list beside the map names each one, so they read without the colours.
export const LOOP_COLORS = ['#2a78d6', '#d95926', '#199e70'] as const

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
        properties: { index, color: LOOP_COLORS[index % LOOP_COLORS.length]!, highlighted: index === highlighted, dimmed: highlighted !== null && index !== highlighted },
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
  map.addSource(LOOPS_SOURCE, { type: 'geojson', data: loopsData({ start: null, loops: [], highlighted: null }) })
  map.addSource(START_SOURCE, { type: 'geojson', data: startData(null) })

  map.addLayer({
    id: 'loop-proposals-casing',
    type: 'line',
    source: LOOPS_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'highlighted'], 9, 7], 'line-opacity': ['case', ['get', 'dimmed'], 0.5, 1] },
  })
  map.addLayer({
    id: 'loop-proposals',
    type: 'line',
    source: LOOPS_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'highlighted'], 6, 4], 'line-opacity': ['case', ['get', 'dimmed'], 0.5, 1] },
  })
  map.addLayer({
    id: LOOPS_HIT_LAYER,
    type: 'line',
    source: LOOPS_SOURCE,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
  })
  // Same look as a route's start.
  map.addLayer({
    id: 'loop-start',
    type: 'circle',
    source: START_SOURCE,
    paint: { 'circle-radius': 7, 'circle-color': START_COLOR, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
  })
}

export function setLoopLayerData(map: Map, data: LoopLayerData) {
  map.getSource<GeoJSONSource>(LOOPS_SOURCE)?.setData(loopsData(data))
  map.getSource<GeoJSONSource>(START_SOURCE)?.setData(startData(data.start))
}
