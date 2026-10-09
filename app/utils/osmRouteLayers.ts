import type { FeatureCollection, MultiLineString } from 'geojson'
import type { FilterSpecification, GeoJSONSource, Map } from 'maplibre-gl'
import type { OsmRoute } from '#shared/utils/osmRoutes'
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
