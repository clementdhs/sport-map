<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LngLatBoundsLike, LngLatLike, Map } from 'maplibre-gl'
import type { Basemap } from '~/utils/basemaps'

const props = withDefaults(defineProps<{
  center?: LngLatLike
  zoom?: number
  // Initial view framing these bounds, rather than center and zoom: the first tiles loaded are the right
  // ones (which matters offline, where only the prepared ones exist).
  bounds?: LngLatBoundsLike
}>(), {
  center: () => [2.35, 46.6],
  zoom: 5,
})

const emit = defineEmits<{
  load: [map: Map]
}>()

const { maptilerKey } = useRuntimeConfig().public
const { t } = useI18n()
const { padding } = useMapPadding()

const styleUrl = mapStyleUrl(maptilerKey)

const container = useTemplateRef('container')
const map = shallowRef<Map>()
// Basemap picked by the visitor, and the button picking it (a MapLibre control filled by a teleport).
const basemap = ref<Basemap>(DEFAULT_BASEMAP)
const online = ref(true)
const basemapControl = shallowRef<HTMLElement>()
let setBasemap: ((basemap: Basemap) => void) | undefined
// Exposed as data-map-loaded so end-to-end tests wait for the map before clicking on it.
const loaded = ref(false)
// Exposed as data-map-center ("lng,lat") so end-to-end tests check where the map went.
const center = ref<string>()

onMounted(async () => {
  // maplibre-gl touches `window` at import time, so load it client-side only.
  const [{ Map, NavigationControl, GeolocateControl, ScaleControl, setWorkerUrl }, { default: workerUrl }] = await Promise.all([
    import('maplibre-gl'),
    // MapLibre resolves its worker next to its own file, which breaks once Vite bundles it: let Vite emit the worker.
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
  ])
  setWorkerUrl(workerUrl)
  if (!container.value) return
  basemap.value = loadBasemap()
  online.value = navigator.onLine
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)

  if (!maptilerKey) {
    console.warn('[MapView] NUXT_PUBLIC_MAPTILER_KEY is not set, using MapLibre demo tiles.')
  }

  const instance = new Map({
    container: container.value,
    style: styleUrl,
    center: props.center,
    zoom: props.zoom,
    // MapLibre's own control labels (English by default).
    locale: {
      'Map.Title': t('map.title'),
      'NavigationControl.ZoomIn': t('map.zoomIn'),
      'NavigationControl.ZoomOut': t('map.zoomOut'),
      'NavigationControl.ResetBearing': t('map.resetBearing'),
      'GeolocateControl.FindMyLocation': t('map.findMyLocation'),
      'GeolocateControl.LocationNotAvailable': t('map.locationNotAvailable'),
      'AttributionControl.ToggleAttribution': t('map.toggleAttribution'),
    },
    ...(props.bounds ? { bounds: props.bounds, fitBoundsOptions: { padding: padding(48) } } : {}),
  })
  instance.addControl(new NavigationControl(), 'top-right')
  instance.addControl(new GeolocateControl({ trackUserLocation: true }), 'top-right')
  instance.addControl({
    onAdd: () => {
      basemapControl.value = document.createElement('div')
      basemapControl.value.className = 'maplibregl-ctrl maplibregl-ctrl-group'
      return basemapControl.value
    },
    onRemove: () => {
      basemapControl.value?.remove()
      basemapControl.value = undefined
    },
  }, 'top-right')
  instance.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
  // Before the first tiles are requested, so that a basemap drawn over the style doesn't load the style's own.
  instance.once('style.load', () => {
    setBasemap = addBasemapLayers(instance)
    setBasemap(shownBasemap(basemap.value, online.value))
  })
  instance.once('load', () => {
    emit('load', instance)
    loaded.value = true
  })
  instance.on('moveend', () => {
    const { lng, lat } = instance.getCenter()
    center.value = `${lng.toFixed(4)},${lat.toFixed(4)}`
  })
  map.value = instance
})

function updateOnline() {
  online.value = navigator.onLine
}

watch([basemap, online], () => setBasemap?.(shownBasemap(basemap.value, online.value)))

const basemapItems = computed(() => BASEMAPS.map(id => ({
  label: t(`map.basemaps.${id}`),
  type: 'checkbox' as const,
  checked: basemap.value === id,
  onUpdateChecked: () => {
    basemap.value = id
    saveBasemap(id)
  },
})))

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
  map.value?.remove()
})
</script>

<template>
  <div ref="container" class="size-full" :data-map-loaded="loaded || undefined" :data-map-center="center" />
  <Teleport v-if="basemapControl" :to="basemapControl">
    <UDropdownMenu :items="basemapItems" :content="{ side: 'left', align: 'start' }">
      <button type="button" class="flex items-center justify-center" :title="t('map.basemap')" :aria-label="t('map.basemap')">
        <UIcon name="i-lucide-layers" class="size-4 text-neutral-800" />
      </button>
    </UDropdownMenu>
  </Teleport>
</template>
