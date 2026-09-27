<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'

const props = defineProps<{
  coordinates: LngLat[]
}>()

function onLoad(map: Map) {
  addRouteLayers(map, {
    line: props.coordinates,
    points: [props.coordinates[0]!, props.coordinates.at(-1)!],
  })
  map.fitBounds(routeBounds(props.coordinates), { padding: 48, duration: 0 })
}
</script>

<template>
  <MapView @load="onLoad" />
</template>
