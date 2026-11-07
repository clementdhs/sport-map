<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LngLatBoundsLike, LngLatLike, Map } from 'maplibre-gl'
import type { Basemap } from '~/utils/basemaps'

const props = withDefaults(defineProps<{
  center?: LngLatLike
  zoom?: number
  // Initial view framing these bounds, rather than center and zoom: the first tiles loaded are the right
  // ones (which matters offline, where only the prepared ones exist). Bounds given later are framed until the map
  // first moves (a start area, #147, arriving with the member's account).
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

// The map follows the app's light or dark mode (#109), unless the member keeps it light or dark (#151, in the
// "Calques" panel and the settings). Plan IGN, drawn over the style, stays light.
const colorMode = useColorMode()
const mapStyle = usePreference('mapStyle')
const dark = computed(() => mapStyleDark(mapStyle.value, colorMode.value === 'dark'))
// The style last asked for, and the one on screen (set on each `style.load`, which MapLibre also fires after a diff;
// a failed request leaves it, so the next theme or network change asks again). Exposed as data-map-dark for tests.
let styleRequested = ''
const styleShown = ref('')
const darkStyleUrl = mapStyleUrl(maptilerKey, true)
// Set once the first style is set up: a style diff needs a loaded style (otherwise MapLibre rebuilds it).
let styleLoaded = false

const container = useTemplateRef('container')
const map = shallowRef<Map>()
// Basemap picked by the member (kept in their account), and the "Calques" button (a MapLibre control filled by a
// teleport) opening the panel that picks it, with the 3D view, the page's own controls (route page: track colours)
// and the legend (#104).
const basemap = usePreference('basemap')
const online = ref(true)
const layersControl = shallowRef<HTMLElement>()
const layersButton = useTemplateRef('layersButton')
const layersOpen = ref(false)
// The legend opens from the panel, in its place: rendered (and its chunk loaded) once asked for.
const legendOpen = ref(false)
const legendUsed = ref(false)
let setBasemap: ((basemap: Basemap) => void) | undefined
// The style's elevation source when the 3D view is offered, and whether it is shown (data-map-3d, for end-to-end
// tests: a map opening in 3D without a GPU is too busy to be clicked). The member's choice is kept in their account.
const reliefSource = ref<string>()
const view3d = ref(false)
const map3d = usePreference('map3d')
// Exposed as data-map-loaded so end-to-end tests wait for the map before clicking on it.
const loaded = ref(false)
// Exposed as data-map-center ("lng,lat") and data-map-bearing (whole degrees clockwise from north, 0 to 359) so
// end-to-end tests check where the map went and how it is turned.
const center = ref<string>()
const bearing = ref<string>()
// North up and seen from above: phones then hide the compass (data-map-flat, main.css).
const flat = ref(true)
// Whether the map left its initial view, moved by the visitor or the page.
let moved = false

onMounted(async () => {
  // maplibre-gl touches `window` at import time, so load it client-side only.
  const [{ Map, NavigationControl, GeolocateControl, ScaleControl, setWorkerUrl }, { default: workerUrl }] = await Promise.all([
    import('maplibre-gl'),
    // MapLibre resolves its worker next to its own file, which breaks once Vite bundles it: let Vite emit the worker.
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
  ])
  setWorkerUrl(workerUrl)
  if (!container.value) return
  online.value = navigator.onLine
  // Tilted from the start, so that initial bounds are framed as they will be seen.
  const saved3d = props.relief && map3d.value
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)

  if (!maptilerKey) {
    console.warn('[MapView] NUXT_PUBLIC_MAPTILER_KEY is not set, using MapLibre demo tiles.')
  }

  styleRequested = await availableStyleUrl(maptilerKey, dark.value)
  if (!container.value) return
  // No style in the constructor, which can't transform it: it is set just below, in the topo colours.
  const instance = new Map({
    container: container.value,
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
    // Behind its "i" button on every screen, not only below 640 px (#199).
    attributionControl: { compact: true },
    ...(props.bounds ? { bounds: props.bounds, fitBoundsOptions: { padding: padding(48) } } : {}),
  })
  requestStyle(instance, styleRequested)
  // The app's marker images (start, numbered waypoints, sport marks), drawn when a layer first asks for one.
  instance.on('styleimagemissing', event => addMarkerImage(instance, event.id))
  instance.on('movestart', (event) => {
    if (!('resizing' in event)) moved = true
  })
  // MapLibre shows the compact attribution open until the map is first dragged: fold it as soon as the style or a
  // source fills it in, then leave it to the "i" button.
  const foldAttribution = () => {
    const attribution = instance.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')
    if (!attribution) return
    attribution.classList.remove('maplibregl-compact-show')
    attribution.removeAttribute('open')
    instance.off('styledata', foldAttribution)
    instance.off('sourcedata', foldAttribution)
  }
  instance.on('styledata', foldAttribution)
  instance.on('sourcedata', foldAttribution)
  instance.addControl(new NavigationControl(), 'top-right')
  instance.addControl(new GeolocateControl({ trackUserLocation: true }), 'top-right')
  instance.addControl({
    onAdd: () => {
      layersControl.value = document.createElement('div')
      layersControl.value.className = 'maplibregl-ctrl maplibregl-ctrl-group'
      return layersControl.value
    },
    onRemove: () => {
      layersControl.value?.remove()
      layersControl.value = undefined
    },
  }, 'top-right')
  instance.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
  instance.on('style.load', () => {
    styleShown.value = styleRequested
  })
  // Before the first tiles are requested, so that a basemap drawn over the style doesn't load the style's own.
  instance.once('style.load', () => {
    setBasemap = addBasemapLayers(instance)
    setBasemap(shown.value)
    reliefSource.value = props.relief ? demSource(instance.getStyle()) : undefined
    // The account's choice may have arrived since the map was created.
    view3d.value = !!props.relief && map3d.value && !!reliefSource.value
    if (view3d.value) setMap3d(instance, reliefSource.value!, true, false)
    else if (saved3d) instance.setPitch(0)
    if (props.force3d && !view3d.value && reliefSource.value) setRelief(instance, reliefSource.value, true)
    styleLoaded = true
    // The theme changed while the first style loaded.
    followTheme()
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
    if (shift && next.window === size.window && !instance.isMoving()) instance.panBy([shift / 2, 0], { animate: false }, { resizing: true })
    size = next
  })
  const updateFlat = () => {
    flat.value = instance.getBearing() === 0 && instance.getPitch() === 0
  }
  updateFlat()
  instance.on('rotate', updateFlat)
  instance.on('pitch', updateFlat)
  const updateView = () => {
    const { lng, lat } = instance.getCenter()
    center.value = `${lng.toFixed(4)},${lat.toFixed(4)}`
    bearing.value = String((Math.round(instance.getBearing()) + 360) % 360)
  }
  updateView()
  instance.on('moveend', updateView)
  map.value = instance
})

// Swaps the light and dark styles (theme or member's choice changed) as a diff: they share their sources, so tiles stay, and keepAppLayers keeps what
// the app drew. Costs the style and its sprite, not the tiles. Back online, a light fallback turns dark.
async function followTheme() {
  if (!map.value || !styleLoaded) return
  const url = await availableStyleUrl(maptilerKey, dark.value)
  // Still asked while another style loads: a quick change back to the one on screen must be applied too.
  if (!map.value || (url === styleShown.value && url === styleRequested)) return
  styleRequested = url
  requestStyle(map.value, url)
}

// The style in the topo colours (#230), dark or light as the URL says (offline, it may be the other one than
// asked for), and the app's layers with it.
function requestStyle(instance: Map, url: string) {
  const styleDark = !!maptilerKey && url === darkStyleUrl
  setMapDark(instance, styleDark)
  instance.setStyle(url, { transformStyle: mapStyleTransform(maptilerKey, styleDark) })
}
watch([dark, online], followTheme)

watch(() => props.bounds, (bounds) => {
  if (bounds && map.value && !moved) map.value.fitBounds(bounds, { padding: padding(48), duration: 0 })
})

function updateOnline() {
  online.value = navigator.onLine
}

// The basemap on screen, which the legend explains.
const shown = computed(() => shownBasemap(basemap.value, online.value))
watch(shown, () => setBasemap?.(shown.value))

const basemapItems = computed(() => BASEMAPS.map(id => ({ label: t(`map.basemaps.${id}`), value: id })))

function pickBasemap(id: Basemap) {
  basemap.value = id
}

// The panel stays open while the map is moved, to see what it changes. It gives way to the legend, which opens in
// its place and takes focus: closing the panel then leaves it there.
const layersContent = computed(() => ({
  'side': 'left' as const,
  'align': 'start' as const,
  'aria-label': t('map.layers'),
  'onInteractOutside': keepOpenOnMap,
  'onCloseAutoFocus': (event: Event) => {
    if (legendOpen.value) event.preventDefault()
  },
}))

function keepOpenOnMap(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target
  if (target instanceof Element && target.closest('.maplibregl-map')) event.preventDefault()
}

function openLegend() {
  legendUsed.value = true
  legendOpen.value = true
  layersOpen.value = false
}
watch(layersOpen, (open) => {
  if (open) legendOpen.value = false
})

watch(() => props.force3d, (on) => {
  if (map.value && reliefSource.value && !view3d.value) setRelief(map.value, reliefSource.value, !!on)
})

function toggle3d() {
  if (!map.value || !reliefSource.value || props.force3d) return
  view3d.value = !view3d.value
  map3d.value = view3d.value
  setMap3d(map.value, reliefSource.value, view3d.value)
}

// Changed on another device, and arrived with the account once the map was shown.
watch(map3d, (on) => {
  if (!map.value || !reliefSource.value || props.force3d || on === view3d.value) return
  view3d.value = on
  setMap3d(map.value, reliefSource.value, on)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
  map.value?.remove()
})
</script>

<template>
  <div
    ref="container"
    class="size-full"
    :data-map-loaded="loaded || undefined"
    :data-map-center="center"
    :data-map-bearing="bearing"
    :data-map-flat="flat || undefined"
    :data-map-3d="view3d || undefined"
    :data-map-dark="(maptilerKey && styleShown === darkStyleUrl) || undefined"
  />
  <Teleport v-if="layersControl" :to="layersControl">
    <UPopover v-model:open="layersOpen" :content="layersContent">
      <button ref="layersButton" type="button" class="flex items-center justify-center" :title="t('map.layers')" :aria-label="t('map.layers')">
        <UIcon name="i-lucide-layers" class="size-4 text-neutral-800 dark:text-neutral-100" />
      </button>
      <template #content>
        <div class="w-60 space-y-4 p-3">
          <URadioGroup
            :model-value="basemap"
            :legend="t('map.basemap')"
            :items="basemapItems"
            size="sm"
            :ui="{ legend: 'text-sm font-medium mb-1.5' }"
            @update:model-value="pickBasemap($event as Basemap)"
          />
          <MapStyleSetting v-if="maptilerKey && shown === 'maptiler'" size="sm" />
          <USwitch
            v-if="reliefSource"
            :model-value="view3d || force3d"
            :label="t('map.view3d')"
            :disabled="force3d"
            size="sm"
            @update:model-value="toggle3d"
          />
          <!-- Page-specific controls (route page: track colours). -->
          <slot name="controls" />
          <UButton
            :label="t('mapLegend.title')"
            icon="i-lucide-info"
            trailing-icon="i-lucide-chevron-right"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="-mx-2 w-[calc(100%+1rem)] justify-start"
            :ui="{ trailingIcon: 'ms-auto' }"
            @click="openLegend"
          />
        </div>
      </template>
    </UPopover>
  </Teleport>
  <!-- Lazy: the style expression evaluator it reads the basemap with stays out of the page's bundle. -->
  <LazyMapLegend v-if="legendUsed" v-model:open="legendOpen" :map="map" :basemap="shown" :reference="layersButton ?? undefined" />
</template>
