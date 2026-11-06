<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import type { LngLat } from '#shared/utils/routes'
import type { GpsFix } from '~/composables/useWatchPosition'
import type { MapBearingState, MapOrientation } from '~/utils/mapOrientation'

// Map of the follow mode (the route to follow) and of outing recording (the track recorded so far, which
// grows as the walker moves: only its start is marked, the GPS dot being its end).
const props = defineProps<{
  coordinates: LngLat[]
  recording?: boolean
  fix: GpsFix | null
  // Useful places from OpenStreetMap (#52), saved with the route
  osmPlaces?: OsmPlace[]
  // The data screen covers the map: it then stays still, and catches up when shown again (#182).
  covered?: boolean
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

// North up or turned with the direction of travel (#98, kept in the member's account), with its button among the
// map's controls.
const orientation = usePreference('mapOrientation')
const showOsmPlaces = usePreference('osmPlaces')
const orientationControl = shallowRef<HTMLElement>()
// Bearing a heading-up map aims at, smoothed; null until following (re)starts.
let aimed: MapBearingState | null = null

// Nothing is drawn while the map is out of sight, under the data screen or with the page hidden (the Android app
// records with the screen off): every camera move or new layer data makes MapLibre work for a map nobody sees.
const pageHidden = ref(false)
function onVisibilityChange() {
  pageHidden.value = document.hidden
}
onMounted(() => {
  onVisibilityChange()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibilityChange))
const visible = computed(() => !props.covered && !pageHidden.value)

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
// it would stop it half-way). `turning`: only when the bearing changes (compass between fixes). A pan alone jumps:
// a few metres at walking scale are a few pixels, and an easing redraws the map for half a second at every fix
// (#182). Turning eases, as does a move during an easing, which a jump would stop half-turned. Under reduced
// motion, MapLibre moves the camera at once.
let zoomedIn = false
let flying = false
function center(fix: GpsFix, now: number, turning = false) {
  const instance = map.value
  if (!instance || flying || !visible.value) return
  const bearing = bearingFor(instance, now)
  if (zoomedIn) {
    if (bearing !== instance.getBearing() || instance.isMoving()) instance.easeTo({ center: fix.position, bearing, duration: 500 })
    else if (!turning) instance.jumpTo({ center: fix.position })
    return
  }
  if (turning) return
  zoomedIn = flying = true
  instance.once('moveend', () => (flying = false))
  instance.flyTo({ center: fix.position, bearing, zoom: Math.max(instance.getZoom(), 16) })
}

function showDirection(fix: GpsFix | null, now: number) {
  shownDirection = travelDirectionAt(now)
  if (visible.value) setGps?.(fix, shownDirection)
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
  if (!visible.value || travelDirectionAt(now) === shownDirection) return
  showDirection(props.fix, now)
  if (props.fix && follow.value && orientation.value === 'heading') center(props.fix, now, true)
}
watch(compass.heading, turnBetweenFixes)
onBeforeUnmount(() => clearTimeout(courseAging))

// A recorded track grows at every point: redrawn at most every TRACK_REDRAW_MS, since MapLibre cuts the whole
// line into tiles again each time (20,000 points after 100 km). The GPS arrow shows the latest position meanwhile.
const TRACK_REDRAW_MS = 3000
let trackDrawnAt = 0
let trackTimer: ReturnType<typeof setTimeout> | undefined
// The track changed while out of sight: redrawn once the map shows again.
let trackStale = false
function drawTrack() {
  clearTimeout(trackTimer)
  trackTimer = undefined
  if (!map.value) return
  trackStale = !visible.value
  if (trackStale) return
  trackDrawnAt = Date.now()
  setRouteLayerData(map.value, layerData(props.coordinates))
}
watch(() => props.coordinates, () => {
  if (trackTimer) return
  const wait = trackDrawnAt + TRACK_REDRAW_MS - Date.now()
  if (wait <= 0) drawTrack()
  else trackTimer = setTimeout(drawTrack, wait)
})
onBeforeUnmount(() => clearTimeout(trackTimer))

// Back in sight: the track, the arrow and the camera catch up, straight to the right bearing.
watch(visible, (on) => {
  if (!on || !map.value) return
  if (trackStale) drawTrack()
  const now = Date.now()
  showDirection(props.fix, now)
  aimed = null
  if (props.fix && follow.value) center(props.fix, now)
})

// Following (re)starts, or the orientation changes: straight to the right bearing.
watch([follow, orientation], ([on]) => {
  aimed = null
  if (on && props.fix) center(props.fix, Date.now())
})

function setOrientation(next: MapOrientation) {
  orientation.value = next
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
  <MapView :bounds="coordinates.length >= 2 ? routeBounds(coordinates) : undefined" @load="onLoad">
    <template v-if="osmPlaces?.length" #controls>
      <USwitch v-model="showOsmPlaces" :label="t('osmPlaces.layer')" size="sm" />
    </template>
  </MapView>
  <MapOsmPlaces v-if="map && showOsmPlaces && osmPlaces?.length" :map="map" :places="osmPlaces" />
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
