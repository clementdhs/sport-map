<script setup lang="ts">
import type { FeatureCollection, LineString } from 'geojson'
import type { GeoJSONSource, Map, MapLayerMouseEvent, Popup } from 'maplibre-gl'
import type { CollectionDetail } from '#shared/types/routes'
import type { LngLat } from '#shared/utils/routes'

// The tracks of a collection together (simplified previews), framed on all of them.
const props = defineProps<{
  routes: CollectionDetail['routes']
  highlightedId: string | null
}>()

const emit = defineEmits<{
  hover: [id: string | null]
}>()

const SOURCE = 'collection-routes'
const LAYER = 'collection-routes'
// Wider and invisible: easier to hover or tap than a 4 px line.
const HIT_LAYER = 'collection-routes-hit'

const map = shallowRef<Map>()
let popup: Popup | undefined

function routesData(routes: CollectionDetail['routes']): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map(route => ({
      type: 'Feature',
      properties: { id: route.id, name: route.name },
      geometry: route.preview,
    })),
  }
}

const bounds = computed(() => {
  const coordinates = props.routes.flatMap(route => route.preview.coordinates as LngLat[])
  return coordinates.length ? routeBounds(coordinates) : undefined
})

async function onLoad(instance: Map) {
  const { Popup } = await import('maplibre-gl')
  popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 })

  // promoteId lets the highlight use feature state, without rebuilding the data.
  instance.addSource(SOURCE, { type: 'geojson', data: routesData(props.routes), promoteId: 'id' })
  instance.addLayer({
    id: `${LAYER}-casing`,
    type: 'line',
    source: SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['boolean', ['feature-state', 'highlighted'], false], 9, 6] },
  })
  instance.addLayer({
    id: LAYER,
    type: 'line',
    source: SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROUTE_COLOR,
      'line-width': ['case', ['boolean', ['feature-state', 'highlighted'], false], 6, 3],
    },
  })
  instance.addLayer({
    id: HIT_LAYER,
    type: 'line',
    source: SOURCE,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
  })

  instance.on('mousemove', HIT_LAYER, (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return
    instance.getCanvas().style.cursor = 'pointer'
    emit('hover', feature.properties.id)
    // setText, not setHTML: route names are user content.
    popup!.setLngLat(event.lngLat).setText(feature.properties.name).addTo(instance)
  })
  instance.on('mouseleave', HIT_LAYER, () => {
    instance.getCanvas().style.cursor = ''
    emit('hover', null)
    popup!.remove()
  })
  instance.on('click', HIT_LAYER, (event: MapLayerMouseEvent) => {
    const id = event.features?.[0]?.properties.id
    if (id) navigateTo(`/routes/${id}`)
  })

  map.value = instance
}

watch(() => props.routes, (routes) => {
  map.value?.getSource<GeoJSONSource>(SOURCE)?.setData(routesData(routes))
})

watch(() => props.highlightedId, (id, previousId) => {
  if (!map.value) return
  if (previousId) map.value.setFeatureState({ source: SOURCE, id: previousId }, { highlighted: false })
  if (id) map.value.setFeatureState({ source: SOURCE, id }, { highlighted: true })
})
</script>

<template>
  <MapView relief :bounds="bounds" @load="onLoad" />
</template>
