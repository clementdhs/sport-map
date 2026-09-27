<script setup lang="ts">
import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map, MapLayerMouseEvent, Popup } from 'maplibre-gl'
import type { RouteSummary } from '#shared/types/routes'
import type { LngLat } from '#shared/utils/routes'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'

const props = defineProps<{
  results: RouteSummary[]
  highlightedId: string | null
  // A new object moves the map there (e.g. a place picked in the search box).
  focus: MapFocus | null
  center: LngLat
  zoom: number
}>()

const emit = defineEmits<{
  viewChange: [view: MapViewState]
  hover: [id: string | null]
}>()

const SOURCE = 'search-results'
const LAYER = 'search-results'

const map = shallowRef<Map>()
let popup: Popup | undefined

function resultsData(results: RouteSummary[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: results.map(route => ({
      type: 'Feature',
      properties: { id: route.id, name: route.name },
      geometry: { type: 'Point', coordinates: route.marker },
    })),
  }
}

function emitView(instance: Map) {
  const b = instance.getBounds()
  const clampLng = (value: number) => Math.min(180, Math.max(-180, value))
  const clampLat = (value: number) => Math.min(90, Math.max(-90, value))
  const center = instance.getCenter()
  emit('viewChange', {
    bounds: [clampLng(b.getWest()), clampLat(b.getSouth()), clampLng(b.getEast()), clampLat(b.getNorth())],
    center: [center.lng, center.lat],
    zoom: instance.getZoom(),
  })
}

async function onLoad(instance: Map) {
  const { Popup } = await import('maplibre-gl')
  popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 })

  // promoteId lets the highlight use feature state, without rebuilding the data.
  instance.addSource(SOURCE, { type: 'geojson', data: resultsData(props.results), promoteId: 'id' })
  instance.addLayer({
    id: LAYER,
    type: 'circle',
    source: SOURCE,
    paint: {
      'circle-radius': ['case', ['boolean', ['feature-state', 'highlighted'], false], 10, 7],
      'circle-color': ROUTE_COLOR,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
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
  instance.on('moveend', () => emitView(instance))

  map.value = instance
  emitView(instance)
}

watch(() => props.results, (results) => {
  map.value?.getSource<GeoJSONSource>(SOURCE)?.setData(resultsData(results))
})

watch(() => props.highlightedId, (id, previousId) => {
  if (!map.value) return
  if (previousId) map.value.setFeatureState({ source: SOURCE, id: previousId }, { highlighted: false })
  if (id) map.value.setFeatureState({ source: SOURCE, id }, { highlighted: true })
})

watch(() => props.focus, (focus) => {
  if (!map.value || !focus) return
  if (focus.bbox) map.value.fitBounds(focus.bbox, { padding: 40, maxZoom: 13 })
  else map.value.flyTo({ center: focus.center, zoom: 12 })
})
</script>

<template>
  <MapView :center="center" :zoom="zoom" @load="onLoad" />
</template>
