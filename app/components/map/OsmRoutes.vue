<script setup lang="ts">
import type { Map, MapLayerMouseEvent, Popup } from 'maplibre-gl'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'

// Marked routes of OpenStreetMap (#69): hovering one highlights it, clicking it selects it in the list.
const props = defineProps<{
  routes: OsmRoute[]
  // Hovered or selected route, drawn on top.
  highlightedId: number | null
  // A new object moves the map there (a place picked in the search box, a route picked in the list).
  focus: MapFocus | null
  center: LngLat
  zoom: number
  label: (route: OsmRoute) => string
}>()

const emit = defineEmits<{
  viewChange: [view: MapViewState]
  hover: [id: number | null]
  select: [id: number]
}>()

const map = shallowRef<Map>()
const { focusOn } = useMapPadding()
let popup: Popup | undefined

async function onLoad(instance: Map) {
  const { Popup } = await import('maplibre-gl')
  popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 })
  addOsmRouteLayers(instance)
  setOsmRoutes(instance, props.routes, props.label)
  setOsmRouteHighlight(instance, props.highlightedId)

  instance.on('mousemove', OSM_ROUTES_HIT_LAYER, (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return
    instance.getCanvas().style.cursor = 'pointer'
    emit('hover', feature.properties.id)
    // setText, not setHTML: names come from OpenStreetMap.
    popup!.setLngLat(event.lngLat).setText(feature.properties.name).addTo(instance)
  })
  instance.on('mouseleave', OSM_ROUTES_HIT_LAYER, () => {
    instance.getCanvas().style.cursor = ''
    emit('hover', null)
    popup!.remove()
  })
  instance.on('click', OSM_ROUTES_HIT_LAYER, (event: MapLayerMouseEvent) => {
    const id = event.features?.[0]?.properties.id
    if (typeof id === 'number') emit('select', id)
  })
  instance.on('moveend', () => emit('viewChange', mapViewState(instance)))

  map.value = instance
  emit('viewChange', mapViewState(instance))
}

watch(() => props.routes, (routes) => {
  if (map.value) setOsmRoutes(map.value, routes, props.label)
})

watch(() => props.highlightedId, (id) => {
  if (map.value) setOsmRouteHighlight(map.value, id)
})

watch(() => props.focus, (focus) => {
  if (map.value && focus) focusOn(map.value, focus)
})
</script>

<template>
  <MapView :center="center" :zoom="zoom" @load="onLoad" />
</template>
