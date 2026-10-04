<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'
import type { GpsPosition } from '~/utils/routeLayers'

// Map of a member's outing seen by the family (#46): the route they follow, if any, the track covered so far
// and their latest position. The first view frames all of it; `follow` keeps the latest position centered.
const props = defineProps<{
  route: LngLat[] | null
  track: LngLat[]
  position: GpsPosition | null
  follow: boolean
}>()

const emit = defineEmits<{
  stopFollow: []
}>()

const map = shallowRef<Map>()
let setTrack: ((coordinates: LngLat[]) => void) | undefined
let setPosition: ((position: GpsPosition | null, headingDeg: number | null) => void) | undefined

// A single point has no extent: framed by MapView's zoom around it instead.
const framed = computed(() => [...(props.route ?? []), ...props.track])
const bounds = computed(() => (framed.value.length >= 2 ? routeBounds(framed.value) : undefined))
const center = computed(() => (framed.value.length === 1 ? framed.value[0] : undefined))

function onLoad(instance: Map) {
  if (props.route?.length) addRouteLayers(instance, { line: props.route, points: [props.route[0]!, props.route.at(-1)!] })
  setTrack = addLiveTrackLayers(instance)
  setTrack(props.track)
  setPosition = addGpsLayers(instance)
  setPosition(props.position, null)
  // Only gestures (originalEvent) stop the following, not the map's own easing.
  instance.on('dragstart', event => event.originalEvent && emit('stopFollow'))
  map.value = instance
  if (props.follow) centerOn(props.position)
}

function centerOn(position: GpsPosition | null) {
  if (position) map.value?.easeTo({ center: position.position, zoom: Math.max(map.value.getZoom(), 15), duration: 500 })
}

watch(() => props.track, track => setTrack?.(track))
watch(() => props.position, (position) => {
  setPosition?.(position, null)
  if (props.follow) centerOn(position)
})
watch(() => props.follow, (follow) => {
  if (follow) centerOn(props.position)
})
</script>

<template>
  <MapView :bounds="bounds" :center="center" :zoom="center ? 15 : undefined" @load="onLoad" />
</template>
