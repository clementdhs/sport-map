<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'
import type { GpsFix } from '~/composables/useWatchPosition'
import type { MapBearingState, MapOrientation } from '~/utils/mapOrientation'

// Map of the follow mode (the route to follow) and of outing recording (the track recorded so far, which
// grows as the walker moves: only its start is marked, the GPS dot being its end).
const props = defineProps<{
  coordinates: LngLat[]
  recording?: boolean
  fix: GpsFix | null
}>()

// Keep the position centered (and, heading up, the map turned): a gesture on the map turns it off, the page's
// "Recentrer" button back on.
const follow = defineModel<boolean>('follow', { required: true })

const { t } = useI18n()
const toast = useToast()
const compass = useCompass()

const map = shallowRef<Map>()
let setGps: ((fix: GpsFix | null, headingDeg: number | null) => void) | undefined
// GPS course, and the direction shown by the GPS arrow (course while moving, compass otherwise)
let course = NO_HEADING
let shownDirection: number | null = null

// North up or turned with the direction of travel (#98), with its button among the map's controls.
const orientation = ref<MapOrientation>(loadMapOrientation())
const orientationControl = shallowRef<HTMLElement>()
// Bearing a heading-up map aims at, smoothed; null until following (re)starts.
let aimed: MapBearingState | null = null

function layerData(coordinates: LngLat[]) {
  const [start] = coordinates
  if (!start) return { line: [], points: [] }
  return { line: coordinates, points: props.recording ? [start] : [start, coordinates.at(-1)!] }
}

const isCompassButton = (target: EventTarget | null) => target instanceof Element && !!target.closest('.maplibregl-ctrl-compass')

function onLoad(instance: Map) {
  addRouteLayers(instance, layerData(props.coordinates))

  setGps = addGpsLayers(instance)
  if (props.fix) showFix(props.fix, Date.now())
  // Only gestures (originalEvent) stop the following, not the map's own easing.
  instance.on('dragstart', event => event.originalEvent && (follow.value = false))
  instance.on('rotatestart', (event) => {
    if (event.originalEvent && !isCompassButton(event.originalEvent.target)) follow.value = false
  })
  // MapLibre's compass ("Réorienter vers le nord") turns the map north up, and keeps it so.
  instance.getContainer().querySelector('.maplibregl-ctrl-compass')?.addEventListener('click', () => setOrientation('north'))
  instance.addControl({
    onAdd: () => {
      orientationControl.value = document.createElement('div')
      orientationControl.value.className = 'maplibregl-ctrl maplibregl-ctrl-group'
      return orientationControl.value
    },
    onRemove: () => {
      orientationControl.value?.remove()
      orientationControl.value = undefined
    },
  }, 'top-right')
  map.value = instance
  // The GPS may have answered before the map was ready.
  if (props.fix && follow.value) center(props.fix, Date.now())
}

function travelDirectionAt(now: number): number | null {
  return travelDirection(course, props.fix?.speedMps ?? null, compass.heading.value, now)
}

// The bearing to give the map: north, or towards the direction of travel once it moved far enough from the current one.
function bearingFor(instance: Map, now: number): number {
  if (orientation.value === 'north') return 0
  const direction = travelDirectionAt(now)
  if (direction === null) return instance.getBearing()
  aimed = nextMapBearing(aimed, direction, now)
  return shouldRotate(instance.getBearing(), aimed.deg) ? aimed.deg : instance.getBearing()
}

// The first centering zooms in to walking scale; the next ones, once it got there, only pan and turn (a move during
// it would stop it half-way). `turning`: only when the bearing changes (compass between fixes). Under reduced motion,
// MapLibre moves the camera at once.
let zoomedIn = false
let flying = false
function center(fix: GpsFix, now: number, turning = false) {
  const instance = map.value
  if (!instance || flying) return
  const bearing = bearingFor(instance, now)
  if (zoomedIn) {
    if (!turning || bearing !== instance.getBearing()) instance.easeTo({ center: fix.position, bearing, duration: 500 })
    return
  }
  if (turning) return
  zoomedIn = flying = true
  instance.once('moveend', () => (flying = false))
  instance.flyTo({ center: fix.position, bearing, zoom: Math.max(instance.getZoom(), 16) })
}

function showDirection(fix: GpsFix | null, now: number) {
  shownDirection = travelDirectionAt(now)
  setGps?.(fix, shownDirection)
}

function showFix(fix: GpsFix | null, now: number) {
  if (fix) course = nextHeading(course, fix, now)
  showDirection(fix, now)
}

// Once the course gets old, the compass takes over even if no fix comes (a phone standing still may send none).
let courseAging: ReturnType<typeof setTimeout> | undefined

watch(() => props.fix, (fix) => {
  const now = Date.now()
  showFix(fix, now)
  if (fix && follow.value) center(fix, now)
  clearTimeout(courseAging)
  courseAging = setTimeout(turnBetweenFixes, COURSE_FRESH_MS + 100)
})

// The compass turns the arrow, and a heading-up map, between fixes.
function turnBetweenFixes() {
  const now = Date.now()
  if (travelDirectionAt(now) === shownDirection) return
  showDirection(props.fix, now)
  if (props.fix && follow.value && orientation.value === 'heading') center(props.fix, now, true)
}
watch(compass.heading, turnBetweenFixes)
onBeforeUnmount(() => clearTimeout(courseAging))

watch(() => props.coordinates, (coordinates) => {
  if (map.value) setRouteLayerData(map.value, layerData(coordinates))
})

// Following (re)starts, or the orientation changes: straight to the right bearing.
watch([follow, orientation], ([on]) => {
  aimed = null
  if (on && props.fix) center(props.fix, Date.now())
})

function setOrientation(next: MapOrientation) {
  orientation.value = next
  saveMapOrientation(next)
}

// Picking an orientation also brings the map back to the position.
async function toggleOrientation() {
  setOrientation(orientation.value === 'north' ? 'heading' : 'north')
  follow.value = true
  if (orientation.value === 'north') return
  await compass.requestPermission()
  if (compass.available.value === false) {
    toast.add({ title: t('follow.noCompass'), icon: 'i-lucide-compass', color: 'neutral' })
  }
}
</script>

<template>
  <MapView :bounds="coordinates.length >= 2 ? routeBounds(coordinates) : undefined" @load="onLoad" />
  <Teleport v-if="orientationControl" :to="orientationControl">
    <button
      type="button"
      class="flex items-center justify-center"
      :class="orientation === 'heading' ? 'text-primary' : 'text-neutral-800'"
      :title="t('follow.headingUp')"
      :aria-label="t('follow.headingUp')"
      :aria-pressed="orientation === 'heading'"
      @click="toggleOrientation"
    >
      <UIcon name="i-lucide-navigation" class="size-4" />
    </button>
  </Teleport>
</template>
