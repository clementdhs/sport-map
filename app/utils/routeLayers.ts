import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, LngLatBoundsLike, Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'

export const ROUTE_COLOR = '#ea580c'

const LINE_SOURCE = 'route-line'
const POINTS_SOURCE = 'route-points'
const HOVER_SOURCE = 'route-hover'

// Invisible, wider copies of the line and points: easier to grab, especially with a finger.
export const LINE_HIT_LAYER = 'route-line-hit'
export const POINTS_HIT_LAYER = 'route-points-hit'

// `line` is the drawn track; `points` are the markers on it (waypoints, or just start and end).
export interface RouteLayerData {
  line: LngLat[]
  points: LngLat[]
}

function hoverData(point: LngLat | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: point ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: point } }] : [],
  }
}

function lineData(coordinates: LngLat[]): Feature<LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
}

function pointsData(coordinates: LngLat[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: coordinates.map((coordinate, index) => ({
      type: 'Feature',
      properties: {
        index,
        role: index === 0 ? 'start' : index === coordinates.length - 1 ? 'end' : 'via',
      },
      geometry: { type: 'Point', coordinates: coordinate },
    })),
  }
}

export function addRouteLayers(map: Map, { line, points }: RouteLayerData, { editable = false } = {}) {
  map.addSource(LINE_SOURCE, { type: 'geojson', data: lineData(line) })
  map.addSource(POINTS_SOURCE, { type: 'geojson', data: pointsData(points) })

  map.addLayer({
    id: 'route-line-casing',
    type: 'line',
    source: LINE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 7 },
  })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: LINE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ROUTE_COLOR, 'line-width': 4 },
  })
  map.addLayer({
    id: 'route-points',
    type: 'circle',
    source: POINTS_SOURCE,
    paint: {
      'circle-radius': ['match', ['get', 'role'], 'via', 4, 7],
      'circle-color': ['match', ['get', 'role'], 'start', '#16a34a', 'end', '#dc2626', '#ffffff'],
      'circle-stroke-color': ['match', ['get', 'role'], 'via', ROUTE_COLOR, '#ffffff'],
      'circle-stroke-width': 2,
    },
  })

  // Position hovered on the elevation profile, empty the rest of the time.
  map.addSource(HOVER_SOURCE, { type: 'geojson', data: hoverData(null) })
  map.addLayer({
    id: HOVER_SOURCE,
    type: 'circle',
    source: HOVER_SOURCE,
    paint: {
      'circle-radius': 7,
      'circle-color': '#ffffff',
      'circle-stroke-color': ROUTE_COLOR,
      'circle-stroke-width': 3,
    },
  })

  if (!editable) return
  map.addLayer({
    id: LINE_HIT_LAYER,
    type: 'line',
    source: LINE_SOURCE,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
  })
  map.addLayer({
    id: POINTS_HIT_LAYER,
    type: 'circle',
    source: POINTS_SOURCE,
    paint: { 'circle-color': '#000000', 'circle-opacity': 0, 'circle-radius': 14 },
  })
}

export function setRouteLayerData(map: Map, { line, points }: RouteLayerData) {
  map.getSource<GeoJSONSource>(LINE_SOURCE)?.setData(lineData(line))
  map.getSource<GeoJSONSource>(POINTS_SOURCE)?.setData(pointsData(points))
}

export function setRouteHover(map: Map, point: LngLat | null) {
  map.getSource<GeoJSONSource>(HOVER_SOURCE)?.setData(hoverData(point))
}

export function routeBounds(coordinates: LngLat[]): LngLatBoundsLike {
  const lngs = coordinates.map(([lng]) => lng)
  const lats = coordinates.map(([, lat]) => lat)
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
}
