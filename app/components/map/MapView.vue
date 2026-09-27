<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LngLatLike, Map } from 'maplibre-gl'

const props = withDefaults(defineProps<{
  center?: LngLatLike
  zoom?: number
}>(), {
  center: () => [2.35, 46.6],
  zoom: 5,
})

const emit = defineEmits<{
  load: [map: Map]
}>()

const { maptilerKey } = useRuntimeConfig().public

// Keyless fallback so the app runs before a MapTiler key is configured (low-detail tiles).
const styleUrl = maptilerKey
  ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${maptilerKey}`
  : 'https://demotiles.maplibre.org/style.json'

const container = useTemplateRef('container')
const map = shallowRef<Map>()
// Exposed as data-map-loaded so end-to-end tests wait for the map before clicking on it.
const loaded = ref(false)

onMounted(async () => {
  // maplibre-gl touches `window` at import time, so load it client-side only.
  const [{ Map, NavigationControl, GeolocateControl, ScaleControl, setWorkerUrl }, { default: workerUrl }] = await Promise.all([
    import('maplibre-gl'),
    // MapLibre resolves its worker next to its own file, which breaks once Vite bundles it: let Vite emit the worker.
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
  ])
  setWorkerUrl(workerUrl)
  if (!container.value) return

  if (!maptilerKey) {
    console.warn('[MapView] NUXT_PUBLIC_MAPTILER_KEY is not set, using MapLibre demo tiles.')
  }

  const instance = new Map({
    container: container.value,
    style: styleUrl,
    center: props.center,
    zoom: props.zoom,
  })
  instance.addControl(new NavigationControl(), 'top-right')
  instance.addControl(new GeolocateControl({ trackUserLocation: true }), 'top-right')
  instance.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
  instance.once('load', () => {
    emit('load', instance)
    loaded.value = true
  })
  map.value = instance
})

onBeforeUnmount(() => {
  map.value?.remove()
})
</script>

<template>
  <div ref="container" class="size-full" :data-map-loaded="loaded || undefined" />
</template>
