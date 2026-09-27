<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'

const props = defineProps<{
  coordinates: LngLat[]
  // Position hovered on the elevation profile
  hoverPoint?: LngLat | null
}>()

const map = shallowRef<Map>()

function onLoad(instance: Map) {
  addRouteLayers(instance, {
    line: props.coordinates,
    points: [props.coordinates[0]!, props.coordinates.at(-1)!],
  })
  instance.fitBounds(routeBounds(props.coordinates), { padding: 48, duration: 0 })
  map.value = instance
}

watch(() => props.hoverPoint, (point) => {
  if (map.value) setRouteHover(map.value, point ?? null)
})
</script>

<template>
  <MapView @load="onLoad" />
</template>
