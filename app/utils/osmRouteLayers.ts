import type { FeatureCollection, LineString, MultiLineString, Point } from 'geojson'
import type { FilterSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'
import { ROUTE_COLOR } from '~/utils/routeLayers'

// Marked routes of OpenStreetMap (#69): dozens of lines that often share paths, all in one colour; the highlighted one
// is drawn again on top, in the colour of the app's routes.

// Categorical slot 1 of the dataviz palette, as the first loop proposal.
const LINE_COLOR = '#2a78d6'
const SOURCE = 'osm-routes'
const HIGHLIGHT_LAYERS = ['osm-routes-highlight-casing', 'osm-routes-highlight']
export const OSM_ROUTES_HIT_LAYER = 'osm-routes-hit'

// Required by the ODbL wherever its data is shown, whatever the basemap.
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

function routesData(routes: OsmRoute[], label: (route: OsmRoute) => string): FeatureCollection<MultiLineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map(route => ({
      type: 'Feature',
      properties: { id: route.id, name: label(route), complete: route.complete },
      geometry: { type: 'MultiLineString', coordinates: route.lines },
    })),
  }
}

const highlightFilter = (id: number | null): FilterSpecification => ['==', ['get', 'id'], id ?? -1]

export function addOsmRouteLayers(map: Map) {
  map.addSource(SOURCE, { type: 'geojson', data: routesData([], () => ''), attribution: ATTRIBUTION })

  const line = { 'line-color': LINE_COLOR, 'line-width': 3, 'line-opacity': 0.8 }
  map.addLayer({
    id: 'osm-routes',
    type: 'line',
    source: SOURCE,
    filter: ['get', 'complete'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: line,
  })
  // The pieces of a route whose ways don't connect.
  map.addLayer({
    id: 'osm-routes-incomplete',
    type: 'line',
    source: SOURCE,
    filter: ['!', ['get', 'complete']],
    layout: { 'line-join': 'round' },
    paint: { ...line, 'line-dasharray': [2, 1.5] },
  })
  map.addLayer({
    id: HIGHLIGHT_LAYERS[0]!,
    type: 'line',
    source: SOURCE,
    filter: highlightFilter(null),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 8 },
  })
  map.addLayer({
    id: HIGHLIGHT_LAYERS[1]!,
    type: 'line',
    source: SOURCE,
    filter: highlightFilter(null),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ROUTE_COLOR, 'line-width': 5 },
  })
  map.addLayer({
    id: OSM_ROUTES_HIT_LAYER,
    type: 'line',
    source: SOURCE,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 14 },
  })
}

export function setOsmRoutes(map: Map, routes: OsmRoute[], label: (route: OsmRoute) => string) {
  map.getSource<GeoJSONSource>(SOURCE)?.setData(routesData(routes, label))
}

export function setOsmRouteHighlight(map: Map, id: number | null) {
  for (const layer of HIGHLIGHT_LAYERS) map.setFilter(layer, highlightFilter(id))
}

// A section of the route (#72), drawn over it like the app's routes, with its departure and arrival (the editor's
// green and red points), which are dragged along the route.
const SECTION_SOURCE = 'osm-section'
const SECTION_ENDS_SOURCE = 'osm-section-ends'
export const OSM_SECTION_ENDS_HIT_LAYER = 'osm-section-ends-hit'

export interface OsmSectionLayerData {
  coordinates: LngLat[]
  from: LngLat
  to: LngLat
}

function sectionLineData(section: OsmSectionLayerData | null): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: section && section.coordinates.length > 1
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: section.coordinates } }]
      : [],
  }
}

function sectionEndsData(section: OsmSectionLayerData | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    // The departure on top when both ends meet.
    features: section
      ? (['to', 'from'] as const).map(end => ({ type: 'Feature', properties: { end }, geometry: { type: 'Point', coordinates: section[end] } }))
      : [],
  }
}

// Added after the routes' layers: the ends must be grabbed before the route under them.
export function addOsmSectionLayers(map: Map) {
  map.addSource(SECTION_SOURCE, { type: 'geojson', data: sectionLineData(null) })
  map.addSource(SECTION_ENDS_SOURCE, { type: 'geojson', data: sectionEndsData(null) })
  map.addLayer({
    id: 'osm-section-casing',
    type: 'line',
    source: SECTION_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 9 },
  })
  map.addLayer({
    id: 'osm-section',
    type: 'line',
    source: SECTION_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ROUTE_COLOR, 'line-width': 5 },
  })
  map.addLayer({
    id: 'osm-section-ends',
    type: 'circle',
    source: SECTION_ENDS_SOURCE,
    paint: {
      'circle-radius': 8,
      'circle-color': ['match', ['get', 'end'], 'from', '#16a34a', '#dc2626'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: OSM_SECTION_ENDS_HIT_LAYER,
    type: 'circle',
    source: SECTION_ENDS_SOURCE,
    paint: { 'circle-radius': 18, 'circle-opacity': 0 },
  })
}

export function setOsmSection(map: Map, section: OsmSectionLayerData | null) {
  map.getSource<GeoJSONSource>(SECTION_SOURCE)?.setData(sectionLineData(section))
  map.getSource<GeoJSONSource>(SECTION_ENDS_SOURCE)?.setData(sectionEndsData(section))
}
