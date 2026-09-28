<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'
import type { GpsFix } from '~/composables/useWatchPosition'

// Map of the follow mode (the route to follow) and of outing recording (the track recorded so far, which
// grows as the walker moves: only its start is marked, the GPS dot being its end).
const props = defineProps<{
  coordinates: LngLat[]
  recording?: boolean
  fix: GpsFix | null
  // Keep the position centered; the parent turns it off when the user moves the map.
  follow: boolean
}>()

const emit = defineEmits<{
  stopFollow: []
}>()

const map = shallowRef<Map>()
let setGps: ((fix: GpsFix | null) => void) | undefined

function layerData(coordinates: LngLat[]) {
  const [start] = coordinates
  if (!start) return { line: [], points: [] }
  return { line: coordinates, points: props.recording ? [start] : [start, coordinates.at(-1)!] }
}

function onLoad(instance: Map) {
  addRouteLayers(instance, layerData(props.coordinates))

  setGps = addGpsLayers(instance, props.fix)
  // Only gestures (originalEvent) stop the following, not the map's own easing.
  instance.on('dragstart', event => event.originalEvent && emit('stopFollow'))
  map.value = instance
  // The GPS may have answered before the map was ready.
  if (props.fix && props.follow) center(props.fix)
}

// The first centering zooms in to walking scale; the next ones only pan.
let zoomedIn = false
function center(fix: GpsFix) {
  const instance = map.value
  if (!instance) return
  if (zoomedIn) {
    instance.easeTo({ center: fix.position, duration: 500 })
    return
  }
  instance.flyTo({ center: fix.position, zoom: Math.max(instance.getZoom(), 16) })
  zoomedIn = true
}

watch(() => props.fix, (fix) => {
  setGps?.(fix)
  if (fix && props.follow) center(fix)
})

watch(() => props.coordinates, (coordinates) => {
  if (map.value) setRouteLayerData(map.value, layerData(coordinates))
})

watch(() => props.follow, (follow) => {
  if (follow && props.fix) center(props.fix)
})
</script>

<template>
  <MapView :bounds="coordinates.length >= 2 ? routeBounds(coordinates) : undefined" @load="onLoad" />
</template>
