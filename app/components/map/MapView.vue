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
  // Offers the 3D view (relief and tilted map), when the style has an elevation source. Left out of the editor
  // (placing points on a tilted map is less precise) and of follow/record (battery, GPU).
  relief?: boolean
  // Relief shown whatever the visitor's choice, without changing it (flyover, #74, which tilts the camera itself).
  force3d?: boolean
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
// Basemap picked by the visitor, and the button picking it (a MapLibre control filled by a teleport, which
// also holds the 3D button).
const basemap = ref<Basemap>(DEFAULT_BASEMAP)
const online = ref(true)
const basemapControl = shallowRef<HTMLElement>()
let setBasemap: ((basemap: Basemap) => void) | undefined
// The style's elevation source when the 3D view is offered, and whether it is shown.
const reliefSource = ref<string>()
const view3d = ref(false)
// Exposed as data-map-loaded so end-to-end tests wait for the map before clicking on it.
const loaded = ref(false)
// Exposed as data-map-center ("lng,lat") and data-map-bearing (whole degrees clockwise from north, 0 to 359) so
// end-to-end tests check where the map went and how it is turned.
const center = ref<string>()
const bearing = ref<string>()

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
  // Tilted from the start, so that initial bounds are framed as they will be seen.
  const saved3d = props.relief && loadMap3d()
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
    pitch: saved3d ? PITCH_3D : 0,
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
    setBasemap(shown.value)
    reliefSource.value = props.relief ? demSource(instance.getStyle()) : undefined
    view3d.value = saved3d && !!reliefSource.value
    if (view3d.value) setMap3d(instance, reliefSource.value!, true, false)
    else if (saved3d) instance.setPitch(0)
    if (props.force3d && !view3d.value && reliefSource.value) setRelief(instance, reliefSource.value, true)
  })
  instance.once('load', () => {
    emit('load', instance)
    loaded.value = true
  })
  // When the map alone changes width (MapSheetLayout's side panel, on its right, collapsed or expanded), its
  // left edge stays in place instead of its centre: the map doesn't jump. Window resizes keep the centre.
  let size = { map: container.value.clientWidth, window: window.innerWidth }
  instance.on('resize', () => {
    const next = { map: instance.getContainer().clientWidth, window: window.innerWidth }
    const shift = next.map - size.map
    if (shift && next.window === size.window && !instance.isMoving()) instance.panBy([shift / 2, 0], { animate: false })
    size = next
  })
  instance.on('moveend', () => {
    const { lng, lat } = instance.getCenter()
    center.value = `${lng.toFixed(4)},${lat.toFixed(4)}`
    bearing.value = String((Math.round(instance.getBearing()) + 360) % 360)
  })
  map.value = instance
})

function updateOnline() {
  online.value = navigator.onLine
}

// The basemap on screen, which the legend explains.
const shown = computed(() => shownBasemap(basemap.value, online.value))
watch(shown, () => setBasemap?.(shown.value))

const basemapItems = computed(() => BASEMAPS.map(id => ({
  label: t(`map.basemaps.${id}`),
  type: 'checkbox' as const,
  checked: basemap.value === id,
  onUpdateChecked: () => {
    basemap.value = id
    saveBasemap(id)
  },
})))

watch(() => props.force3d, (on) => {
  if (map.value && reliefSource.value && !view3d.value) setRelief(map.value, reliefSource.value, !!on)
})

function toggle3d() {
  if (!map.value || !reliefSource.value || props.force3d) return
  view3d.value = !view3d.value
  saveMap3d(view3d.value)
  setMap3d(map.value, reliefSource.value, view3d.value)
}

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
  map.value?.remove()
})
</script>

<template>
  <div ref="container" class="size-full" :data-map-loaded="loaded || undefined" :data-map-center="center" :data-map-bearing="bearing" />
  <Teleport v-if="basemapControl" :to="basemapControl">
    <UDropdownMenu :items="basemapItems" :content="{ side: 'left', align: 'start' }">
      <button type="button" class="flex items-center justify-center" :title="t('map.basemap')" :aria-label="t('map.basemap')">
        <UIcon name="i-lucide-layers" class="size-4 text-neutral-800" />
      </button>
    </UDropdownMenu>
    <!-- Lazy: the style expression evaluator it reads the basemap with stays out of the page's bundle. -->
    <LazyMapLegend :map="map" :basemap="shown" />
    <button
      v-if="reliefSource"
      type="button"
      class="flex items-center justify-center text-xs font-bold"
      :class="view3d || force3d ? 'text-primary' : 'text-neutral-800'"
      :title="t('map.view3d')"
      :aria-label="t('map.view3d')"
      :aria-pressed="view3d || force3d"
      :disabled="force3d"
      @click="toggle3d"
    >
      3D
    </button>
  </Teleport>
</template>
