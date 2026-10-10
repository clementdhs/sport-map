import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { ExpressionSpecification, GeoJSONSource, LngLatBoundsLike, Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'

export const ROUTE_COLOR = '#ea580c'
// Start and end markers, on every map that shows them.
export const START_COLOR = '#16a34a'
export const END_COLOR = '#dc2626'

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
  // lineMetrics: needed by line-gradient, to colour the track by slope, surface or difficulty.
  map.addSource(LINE_SOURCE, { type: 'geojson', data: lineData(line), lineMetrics: true })
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
      'circle-color': ['match', ['get', 'role'], 'start', START_COLOR, 'end', END_COLOR, '#ffffff'],
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

// Colours the track along its length (a line-gradient expression, see lineGradient in shared/utils/slopes.ts), or
// back to the route colour.
export function setRouteGradient(map: Map, gradient: unknown[] | null) {
  map.setPaintProperty('route-line', 'line-gradient', (gradient ?? undefined) as ExpressionSpecification | undefined)
}

export function setRouteHover(map: Map, point: LngLat | null) {
  map.getSource<GeoJSONSource>(HOVER_SOURCE)?.setData(hoverData(point))
}

export function routeBounds(coordinates: LngLat[]): LngLatBoundsLike {
  const lngs = coordinates.map(([lng]) => lng)
  const lats = coordinates.map(([, lat]) => lat)
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
}

const LIVE_TRACK_SOURCE = 'live-track'

// Track covered by a member sharing their position (#46), in the GPS colour, above the route they follow.
// Returns the function to call with the whole track each time it grows.
export function addLiveTrackLayers(map: Map): (coordinates: LngLat[]) => void {
  map.addSource(LIVE_TRACK_SOURCE, { type: 'geojson', data: lineData([]) })
  map.addLayer({
    id: 'live-track-casing',
    type: 'line',
    source: LIVE_TRACK_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 7 },
  })
  map.addLayer({
    id: 'live-track',
    type: 'line',
    source: LIVE_TRACK_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': GPS_COLOR, 'line-width': 4 },
  })
  return coordinates => map.getSource<GeoJSONSource>(LIVE_TRACK_SOURCE)?.setData(lineData(coordinates))
}

// Live GPS position: a dot, or an arrow pointing the direction of travel when it is known, and a halo sized
// to the fix's accuracy (in meters, so it depends on the zoom).
const GPS_SOURCE = 'gps-position'
export const GPS_COLOR = '#2563eb'
const GPS_ARROW = 'gps-arrow'

export interface GpsPosition {
  position: LngLat
  accuracyM: number
}

function gpsData(map: Map, fix: GpsPosition | null, headingDeg: number | null): FeatureCollection<Point> {
  if (!fix) return { type: 'FeatureCollection', features: [] }
  const metersPerPixel = (40_075_016.686 * Math.cos((fix.position[1] * Math.PI) / 180)) / (512 * 2 ** map.getZoom())
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        halo: Math.min(fix.accuracyM / metersPerPixel, 400),
        ...(headingDeg === null ? {} : { heading: headingDeg }),
      },
      geometry: { type: 'Point', coordinates: fix.position },
    }],
  }
}

// A navigation arrow pointing north, in a 32 px square, in the dot's colors (white outline, readable on any
// basemap). Its corners are shared with the map legend.
export const GPS_ARROW_POINTS: readonly [number, number][] = [[16, 3], [27, 28], [16, 22], [5, 28]]
// Width of its white outline.
export const GPS_ARROW_OUTLINE = 5

function arrowImage(): ImageData {
  const ratio = 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32 * ratio
  const context = canvas.getContext('2d')!
  context.scale(ratio, ratio)
  context.beginPath()
  for (const [x, y] of GPS_ARROW_POINTS) context.lineTo(x, y)
  context.closePath()
  context.lineJoin = 'round'
  context.lineWidth = GPS_ARROW_OUTLINE
  context.strokeStyle = '#ffffff'
  context.stroke()
  context.fillStyle = GPS_COLOR
  context.fill()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

// Returns the function to call with each new fix and the direction of travel (degrees clockwise from north,
// null when unknown); the halo follows the zoom by itself.
export function addGpsLayers(map: Map): (fix: GpsPosition | null, headingDeg: number | null) => void {
  let current: GpsPosition | null = null
  let heading: number | null = null
  map.addImage(GPS_ARROW, arrowImage(), { pixelRatio: 2 })
  map.addSource(GPS_SOURCE, { type: 'geojson', data: gpsData(map, current, heading) })
  map.addLayer({
    id: 'gps-halo',
    type: 'circle',
    source: GPS_SOURCE,
    paint: { 'circle-radius': ['get', 'halo'], 'circle-color': GPS_COLOR, 'circle-opacity': 0.15 },
  })
  map.addLayer({
    id: 'gps-dot',
    type: 'circle',
    source: GPS_SOURCE,
    filter: ['!', ['has', 'heading']],
    paint: { 'circle-radius': 8, 'circle-color': GPS_COLOR, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
  })
  map.addLayer({
    id: 'gps-arrow',
    type: 'symbol',
    source: GPS_SOURCE,
    filter: ['has', 'heading'],
    layout: {
      'icon-image': GPS_ARROW,
      'icon-rotate': ['get', 'heading'],
      // The arrow keeps pointing the right way when the map is rotated.
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  const update = () => map.getSource<GeoJSONSource>(GPS_SOURCE)?.setData(gpsData(map, current, heading))
  map.on('zoom', update)
  return (fix, headingDeg) => {
    current = fix
    heading = headingDeg
    update()
  }
}

// Flyover (#74): the moving point, and when an outing is replayed its own GPS track, in the GPS colour above the
// route. Removed when the flyover stops.
const FLYOVER_POINT_SOURCE = 'flyover-point'
const FLYOVER_TRACK_SOURCE = 'flyover-track'

export interface FlyoverLayers {
  move: (point: LngLat) => void
  remove: () => void
}

export function addFlyoverLayers(map: Map, gpsTrack: LngLat[] | null): FlyoverLayers {
  const color = gpsTrack ? GPS_COLOR : ROUTE_COLOR
  const layers: string[] = []
  if (gpsTrack) {
    map.addSource(FLYOVER_TRACK_SOURCE, { type: 'geojson', data: lineData(gpsTrack) })
    map.addLayer({
      id: 'flyover-track-casing',
      type: 'line',
      source: FLYOVER_TRACK_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 7 },
    })
    map.addLayer({
      id: 'flyover-track',
      type: 'line',
      source: FLYOVER_TRACK_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': GPS_COLOR, 'line-width': 4 },
    })
    layers.push('flyover-track-casing', 'flyover-track')
  }
  map.addSource(FLYOVER_POINT_SOURCE, { type: 'geojson', data: hoverData(null) })
  map.addLayer({
    id: FLYOVER_POINT_SOURCE,
    type: 'circle',
    source: FLYOVER_POINT_SOURCE,
    paint: { 'circle-radius': 8, 'circle-color': color, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
  })
  layers.push(FLYOVER_POINT_SOURCE)
  return {
    move: point => map.getSource<GeoJSONSource>(FLYOVER_POINT_SOURCE)?.setData(hoverData(point)),
    remove: () => {
      for (const id of layers) if (map.getLayer(id)) map.removeLayer(id)
      for (const id of [FLYOVER_POINT_SOURCE, FLYOVER_TRACK_SOURCE]) if (map.getSource(id)) map.removeSource(id)
    },
  }
}
