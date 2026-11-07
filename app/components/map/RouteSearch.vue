<script setup lang="ts">
import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map, MapLayerMouseEvent, Marker, Popup } from 'maplibre-gl'
import type { RouteSummary } from '#shared/types/routes'
import type { LngLat } from '#shared/utils/routes'
import type { Bounds, MapFocus, MapViewState } from '~/stores/routeSearch'

const props = defineProps<{
  results: RouteSummary[]
  highlightedId: string | null
  // A new object moves the map there (e.g. a place picked in the search box).
  focus: MapFocus | null
  center: LngLat
  zoom: number
  // First view, rather than center and zoom: the member's start area (#147).
  bounds?: Bounds
}>()

const emit = defineEmits<{
  viewChange: [view: MapViewState]
  hover: [id: string | null]
}>()

const SOURCE = 'search-results'
const LAYER = 'search-results'

const { t, locale } = useI18n()
const map = shallowRef<Map>()
const { focusOn, offset } = useMapPadding()
let popup: Popup | undefined
let MarkerClass: typeof Marker | undefined
// Groups of nearby starts are HTML buttons (keyboard and screen readers reach them, and they need no glyphs).
// Keyed by cluster id, count and place: an id only holds for one data set, and a search refetched with the same
// results keeps its buttons (and the keyboard focus).
let clusterMarkers: Record<string, Marker> = {}
// The route hovered in the list or on the map, drawn above the groups so that it shows even when grouped.
let highlightMarker: Marker | undefined

function resultsData(results: RouteSummary[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: results.map(route => ({
      type: 'Feature',
      properties: { id: route.id, name: route.name, sport: route.sport_type },
      geometry: { type: 'Point', coordinates: route.marker },
    })),
  }
}

function emitView(instance: Map) {
  emit('viewChange', mapViewState(instance))
}

function labelCluster(button: HTMLElement) {
  button.title = t('home.cluster', Number(button.dataset.routeCluster))
  button.setAttribute('aria-label', button.title)
}

function clusterMarker(instance: Map, clusterId: number, count: number, lngLat: LngLat): Marker {
  const button = document.createElement('button')
  button.type = 'button'
  // An ink square with the count, like the numbered waypoints (map-cluster, main.css).
  button.className = 'map-cluster flex cursor-pointer items-center justify-center rounded-sm text-xs font-bold shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
  const size = count < 10 ? 26 : count < 50 ? 30 : 36
  button.style.width = button.style.height = `${size}px`
  button.textContent = String(count)
  button.dataset.routeCluster = String(count)
  labelCluster(button)
  button.addEventListener('click', async (event) => {
    // Not a click on the map below.
    event.stopPropagation()
    // Rejected when the results changed since: the group is gone.
    const zoom = await instance.getSource<GeoJSONSource>(SOURCE)?.getClusterExpansionZoom(clusterId).catch(() => undefined)
    if (zoom !== undefined) instance.easeTo({ center: lngLat, zoom, offset: offset() })
  })
  return new MarkerClass!({ element: button }).setLngLat(lngLat).addTo(instance)
}

// Called on every render: shows a button for each group drawn by the clustered source, and only those.
function syncClusters(instance: Map) {
  if (!instance.isSourceLoaded(SOURCE)) return
  const next: Record<string, Marker> = {}
  for (const feature of instance.querySourceFeatures(SOURCE)) {
    const { cluster, cluster_id: id, point_count: count } = feature.properties
    if (!cluster) continue
    const lngLat = (feature.geometry as Point).coordinates as LngLat
    const key = `${id}:${count}:${lngLat}`
    // A group that crosses tile edges comes once per tile.
    next[key] ??= clusterMarkers[key] ?? clusterMarker(instance, id, count, lngLat)
  }
  for (const [key, marker] of Object.entries(clusterMarkers)) {
    if (!next[key]) marker.remove()
  }
  clusterMarkers = next
}

function showHighlight() {
  const instance = map.value
  if (!instance) return
  const route = props.highlightedId ? props.results.find(({ id }) => id === props.highlightedId) : undefined
  if (!route) {
    highlightMarker?.remove()
    return
  }
  if (!highlightMarker) {
    const dot = document.createElement('div')
    // No pointer events: under the mouse, it would end the map hover that shows it.
    // A frame rather than a dot, so that the start or group below it still shows (map-highlight, main.css).
    dot.className = 'map-highlight pointer-events-none size-8 rounded-md shadow-md'
    dot.style.zIndex = '1'
    dot.dataset.routeHighlight = ''
    highlightMarker = new MarkerClass!({ element: dot })
  }
  highlightMarker.setLngLat(route.marker).addTo(instance)
}

async function onLoad(instance: Map) {
  const maplibre = await import('maplibre-gl')
  MarkerClass = maplibre.Marker
  popup = new maplibre.Popup({ closeButton: false, closeOnClick: false, offset: 12 })

  instance.addSource(SOURCE, { type: 'geojson', data: resultsData(props.results), cluster: true, clusterRadius: 40 })
  // Starts outside any group, as their sport's waymark (#230); the groups themselves are HTML markers
  // (syncClusters).
  instance.addLayer({
    id: LAYER,
    type: 'symbol',
    source: SOURCE,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['concat', `${markerPrefix(instance)}sport-`, ['get', 'sport']],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })

  instance.on('mousemove', LAYER, (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return
    instance.getCanvas().style.cursor = 'pointer'
    emit('hover', feature.properties.id)
    // setText, not setHTML: route names are user content.
    popup!.setLngLat((feature.geometry as Point).coordinates as LngLat).setText(feature.properties.name).addTo(instance)
  })
  instance.on('mouseleave', LAYER, () => {
    instance.getCanvas().style.cursor = ''
    emit('hover', null)
    popup!.remove()
  })
  instance.on('click', LAYER, (event: MapLayerMouseEvent) => {
    const id = event.features?.[0]?.properties.id
    if (id) navigateTo(`/routes/${id}`)
  })
  instance.on('render', () => syncClusters(instance))
  instance.on('moveend', () => emitView(instance))

  map.value = instance
  emitView(instance)
  showHighlight()
}

watch(() => props.results, (results) => {
  const source = map.value?.getSource<GeoJSONSource>(SOURCE)
  if (!source) return
  source.setData(resultsData(results))
  showHighlight()
})

watch(() => props.highlightedId, showHighlight)

watch(locale, () => {
  for (const marker of Object.values(clusterMarkers)) labelCluster(marker.getElement())
})

watch(() => props.focus, (focus) => {
  if (map.value && focus) focusOn(map.value, focus)
})

onBeforeUnmount(() => {
  for (const marker of Object.values(clusterMarkers)) marker.remove()
  highlightMarker?.remove()
})
</script>

<template>
  <MapView relief :center="center" :zoom="zoom" :bounds="bounds" @load="onLoad" />
</template>
