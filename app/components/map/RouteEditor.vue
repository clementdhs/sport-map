<script setup lang="ts">
import type { Map, MapMouseEvent } from 'maplibre-gl'

const editor = useRouteEditorStore()
const map = shallowRef<Map>()

const layerData = computed(() => ({ line: editor.track.coordinates, points: editor.waypoints }))

function onLoad(instance: Map) {
  addRouteLayers(instance, layerData.value)
  instance.getCanvas().style.cursor = 'crosshair'
  instance.on('click', (event: MapMouseEvent) => editor.addWaypoint([event.lngLat.lng, event.lngLat.lat]))
  // Resume a draft kept in the store: frame it instead of the default view.
  if (editor.track.coordinates.length >= 2) {
    instance.fitBounds(routeBounds(editor.track.coordinates), { padding: 48, duration: 0 })
  }
  map.value = instance
}

watch(layerData, (data) => {
  if (map.value) setRouteLayerData(map.value, data)
})

watch(() => editor.replacedCount, () => {
  map.value?.fitBounds(routeBounds(editor.track.coordinates), { padding: 48 })
})
</script>

<template>
  <MapView @load="onLoad" />
</template>
