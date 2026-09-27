<script setup lang="ts">
import type { Map, MapMouseEvent } from 'maplibre-gl'

const editor = useRouteEditorStore()
const map = shallowRef<Map>()

function onLoad(instance: Map) {
  addRouteLayers(instance, editor.points)
  instance.getCanvas().style.cursor = 'crosshair'
  instance.on('click', (event: MapMouseEvent) => editor.addPoint([event.lngLat.lng, event.lngLat.lat]))
  // Resume a draft kept in the store: frame it instead of the default view.
  if (editor.points.length >= 2) {
    instance.fitBounds(routeBounds(editor.points), { padding: 48, duration: 0 })
  }
  map.value = instance
}

watch(() => editor.points, (points) => {
  if (map.value) setRouteCoordinates(map.value, points)
}, { deep: true })
</script>

<template>
  <MapView @load="onLoad" />
</template>
