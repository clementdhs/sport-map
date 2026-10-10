<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { LngLat, Poi } from '#shared/utils/routes'

const props = defineProps<{
  coordinates: LngLat[]
  pois?: Poi[]
  // line-gradient colouring the track (slopes, surface or difficulty), null for the plain route colour
  lineGradient?: unknown[] | null
  // Position hovered on the elevation profile
  hoverPoint?: LngLat | null
}>()

const map = shallowRef<Map>()
const { padding } = useMapPadding()

function onLoad(instance: Map) {
  addRouteLayers(instance, {
    line: props.coordinates,
    points: [props.coordinates[0]!, props.coordinates.at(-1)!],
  })
  instance.fitBounds(routeBounds(props.coordinates), { padding: padding(48), duration: 0 })
  if (props.lineGradient) setRouteGradient(instance, props.lineGradient)
  map.value = instance
}

watch(() => props.lineGradient, (gradient) => {
  if (map.value) setRouteGradient(map.value, gradient ?? null)
})

watch(() => props.hoverPoint, (point) => {
  if (map.value) setRouteHover(map.value, point ?? null)
})
</script>

<template>
  <MapView relief @load="onLoad" />
  <MapPoiMarkers v-if="map && pois?.length" :map="map" :pois="pois" />
</template>
