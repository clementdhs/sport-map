<script setup lang="ts">
import { lineString, nearestPointOnLine } from '@turf/turf'
import type { Map, MapMouseEvent, MapTouchEvent, Marker, PointLike } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'
import { climbsSummary, trackStretch } from '#shared/utils/sessionRoute'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'

const props = defineProps<{
  // Position hovered on the elevation profile
  hoverPoint?: LngLat | null
  // A new object moves the map there (a place picked in the search box), without touching the track.
  focus?: MapFocus | null
}>()

const emit = defineEmits<{
  // Where the map is looking, e.g. to search marked routes there.
  viewChange: [view: MapViewState]
}>()

const editor = useRouteEditorStore()
const loop = useLoopGeneratorStore()
const map = shallowRef<Map>()
const { padding, offset, focusOn } = useMapPadding()
// An empty editor opens on the member's start area (#147); a track (draft, route being edited) is framed instead.
const startBounds = useStartBounds(editor.track.coordinates.length >= 2)

// Moves under this distance (px) count as a click, not a drag.
const DRAG_THRESHOLD_PX = 4

type Drag =
  | { kind: 'move', waypointIndex: number, start: { x: number, y: number }, position: LngLat | null }
  | { kind: 'insert', segmentIndex: number, start: { x: number, y: number }, position: LngLat | null }

// position stays null until the pointer has really moved.
const drag = shallowRef<Drag | null>(null)

// While dragging, the edited segments are previewed as straight lines until the real ones are computed.
// The track is hidden while loops are proposed: one of them would replace it.
const layerData = computed(() => {
  if (loop.open) return { line: [], points: [] }
  const current = drag.value
  if (!current?.position) return { line: editor.track.coordinates, points: editor.waypoints }

  const position = current.position
  const waypoints = [...editor.waypoints]
  const replaced: Record<number, LngLat[]> = {}
  if (current.kind === 'move') {
    const i = current.waypointIndex
    waypoints[i] = position
    if (i > 0) replaced[i - 1] = [waypoints[i - 1]!, position]
    if (i < waypoints.length - 1) replaced[i] = [position, waypoints[i + 1]!]
  }
  else {
    const k = current.segmentIndex
    waypoints.splice(k + 1, 0, position)
    replaced[k] = [editor.waypoints[k]!, position, editor.waypoints[k + 1]!]
  }
  const line = editor.segments.flatMap((segment, i) => replaced[i] ?? segment.coordinates)
  return { line, points: waypoints }
})

function isMultiTouch(event: MapMouseEvent | MapTouchEvent) {
  return 'touches' in event.originalEvent && event.originalEvent.touches.length > 1
}

function pointsAt(instance: Map, point: PointLike) {
  return instance.queryRenderedFeatures(point, { layers: [POINTS_HIT_LAYER] })
}

// The segment whose track passes closest to the grabbed spot.
function nearestSegmentIndex(position: LngLat): number {
  let best = -1
  let bestDistance = Infinity
  editor.segments.forEach((segment, i) => {
    if (segment.coordinates.length < 2) return
    const distance = nearestPointOnLine(lineString(segment.coordinates), position).properties.dist
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}

function startDrag(instance: Map, event: MapMouseEvent | MapTouchEvent, next: Drag) {
  // Keep the map still while dragging.
  event.preventDefault()
  drag.value = next
  instance.getCanvas().style.cursor = 'grabbing'
  const isTouch = event.type === 'touchstart'
  instance.on(isTouch ? 'touchmove' : 'mousemove', onDragMove)
  // On the window: the pointer may be released outside the map.
  window.addEventListener(isTouch ? 'touchend' : 'mouseup', onDragEnd, { once: true })
}

function onDragMove(event: MapMouseEvent | MapTouchEvent) {
  const current = drag.value
  if (!current) return
  if (!current.position && Math.hypot(event.point.x - current.start.x, event.point.y - current.start.y) < DRAG_THRESHOLD_PX) return
  drag.value = { ...current, position: [event.lngLat.lng, event.lngLat.lat] }
}

function onDragEnd() {
  const current = drag.value
  if (!current) return
  const instance = map.value!
  instance.off('mousemove', onDragMove)
  instance.off('touchmove', onDragMove)
  instance.getCanvas().style.cursor = 'crosshair'
  drag.value = null
  if (!current.position) return
  if (current.kind === 'move') editor.moveWaypoint(current.waypointIndex, current.position)
  else editor.insertWaypoint(current.segmentIndex, current.position)
}

// Clicks on a point of interest marker open its popup: they must not also add a waypoint.
function isOnPoiMarker(event: MapMouseEvent | MapTouchEvent) {
  return !!(event.originalEvent.target as HTMLElement | null)?.closest?.('[data-poi-marker]')
}

function onPointDown(instance: Map, event: MapMouseEvent | MapTouchEvent) {
  if (loop.open || editor.placingPoi || isMultiTouch(event) || ('button' in event.originalEvent && event.originalEvent.button !== 0)) return
  const index = pointsAt(instance, event.point)[0]?.properties.index as number | undefined
  if (index === undefined || !editor.canEditWaypoint(index)) return
  startDrag(instance, event, { kind: 'move', waypointIndex: index, start: event.point, position: null })
}

function onLineDown(instance: Map, event: MapMouseEvent | MapTouchEvent) {
  if (loop.open || editor.placingPoi || isMultiTouch(event) || ('button' in event.originalEvent && event.originalEvent.button !== 0)) return
  // Points are drawn over the line: grabbing a point must not also grab the line.
  if (pointsAt(instance, event.point).length) return
  const segmentIndex = nearestSegmentIndex([event.lngLat.lng, event.lngLat.lat])
  if (!editor.canInsertInSegment(segmentIndex)) return
  startDrag(instance, event, { kind: 'insert', segmentIndex, start: event.point, position: null })
}

function onLoad(instance: Map) {
  addRouteLayers(instance, layerData.value, { editable: true })
  addLoopLayers(instance)
  setLoopLayerData(instance, loopLayerData.value)
  const canvas = instance.getCanvas()
  canvas.style.cursor = 'crosshair'

  instance.on('click', (event: MapMouseEvent) => {
    if (isOnPoiMarker(event)) return
    // While loops are proposed, a click places their start or highlights one of them.
    if (loop.open) {
      if (loop.placingStart) loop.setStart([event.lngLat.lng, event.lngLat.lat])
      else loop.highlighted = loopAt(instance, event.point) ?? loop.highlighted
      return
    }
    if (editor.placingPoi) {
      editor.addPoi([event.lngLat.lng, event.lngLat.lat])
      return
    }
    // A click on an existing point is not a new point.
    if (pointsAt(instance, event.point).length) return
    editor.addWaypoint([event.lngLat.lng, event.lngLat.lat])
  })

  instance.on('mousedown', POINTS_HIT_LAYER, event => onPointDown(instance, event))
  instance.on('touchstart', POINTS_HIT_LAYER, event => onPointDown(instance, event))
  instance.on('mousedown', LINE_HIT_LAYER, event => onLineDown(instance, event))
  instance.on('touchstart', LINE_HIT_LAYER, event => onLineDown(instance, event))

  // Right click, or long press on touch screens, removes a point.
  instance.on('contextmenu', POINTS_HIT_LAYER, (event) => {
    event.preventDefault()
    const index = event.features?.[0]?.properties.index as number | undefined
    if (index !== undefined) editor.removeWaypoint(index)
  })

  instance.on('mousemove', (event: MapMouseEvent) => {
    if (drag.value) return
    if (loop.open) {
      canvas.style.cursor = loop.placingStart ? 'crosshair' : loopAt(instance, event.point) === null ? '' : 'pointer'
      return
    }
    if (editor.placingPoi) {
      canvas.style.cursor = 'cell'
      return
    }
    const point = pointsAt(instance, event.point)[0]
    if (point) {
      canvas.style.cursor = editor.canEditWaypoint(point.properties.index) ? 'grab' : 'not-allowed'
      return
    }
    const onLine = instance.queryRenderedFeatures(event.point, { layers: [LINE_HIT_LAYER] }).length > 0
    canvas.style.cursor = onLine ? 'copy' : 'crosshair'
  })

  // Resume a draft kept in the store: frame it instead of the default view.
  if (editor.track.coordinates.length >= 2) {
    instance.fitBounds(routeBounds(editor.track.coordinates), { padding: padding(48), duration: 0 })
  }
  instance.on('moveend', () => emit('viewChange', mapViewState(instance)))
  emit('viewChange', mapViewState(instance))
  map.value = instance
}

watch(layerData, (data) => {
  if (map.value) setRouteLayerData(map.value, data)
})

// The session mode's picked loop (#266): its climbs in ink, and "4 côtes · 7 %" over the first one.
const sessionProposal = computed(() => (loop.open && loop.forSession && loop.picked !== null ? loop.proposals[loop.picked] ?? null : null))
const sessionClimbs = computed(() => {
  const proposal = sessionProposal.value
  return proposal ? (proposal.climbs ?? []).map(climb => trackStretch(proposal.coordinates, climb.startM, climb.endM)) : []
})

const loopLayerData = computed(() => ({
  start: loop.open ? loop.start : null,
  vias: loop.open ? loop.viaPoints : [],
  loops: loop.proposals.map(proposal => proposal.coordinates),
  highlighted: loop.highlighted,
  climbs: sessionClimbs.value,
}))

const { t } = useI18n()
const climbsLabel = computed(() => {
  const summary = climbsSummary(sessionProposal.value?.climbs ?? [])
  const first = sessionClimbs.value[0]
  if (!summary || !first?.length) return null
  return { text: t('sessionRoute.climbsLabel', { count: summary.count, grade: summary.grade }, summary.count), at: first[Math.floor(first.length / 2)]! }
})
// An ink label on the map; the panel says the same in words, so it is hidden from screen readers.
let labelMarker: Marker | null = null
watch([map, climbsLabel], async ([instance, label]) => {
  if (!instance || !label) {
    labelMarker?.remove()
    return
  }
  if (!labelMarker) {
    const { Marker } = await import('maplibre-gl')
    const element = document.createElement('div')
    element.className = 'pointer-events-none rounded bg-inverted px-2 py-0.5 font-numbers text-[0.8125rem] font-bold whitespace-nowrap text-inverted shadow-sm'
    element.setAttribute('aria-hidden', 'true')
    element.dataset.testid = 'session-climbs-label'
    labelMarker ??= new Marker({ element, anchor: 'bottom', offset: [0, -8] })
  }
  if (!climbsLabel.value) return
  labelMarker.getElement().textContent = climbsLabel.value.text
  labelMarker.setLngLat(climbsLabel.value.at).addTo(instance)
})
onBeforeUnmount(() => labelMarker?.remove())

// Index of the proposed loop under the pointer.
function loopAt(instance: Map, point: PointLike): number | null {
  return (instance.queryRenderedFeatures(point, { layers: [LOOPS_HIT_LAYER] })[0]?.properties.index as number | undefined) ?? null
}

watch(loopLayerData, (data) => {
  if (map.value) setLoopLayerData(map.value, data)
})

// A start found by geolocation may be off screen.
watch(() => loop.start, (start) => {
  if (map.value && start && !map.value.getBounds().contains(start)) {
    map.value.flyTo({ center: start, zoom: Math.max(map.value.getZoom(), 13), offset: offset() })
  }
})

// Frames the proposals once they have all come back.
watch(() => loop.settledCount, () => {
  const coordinates = loop.proposals.flatMap(proposal => proposal.coordinates)
  if (map.value && coordinates.length) map.value.fitBounds(routeBounds(coordinates), { padding: padding(48) })
})

watch(() => editor.replacedCount, () => {
  map.value?.fitBounds(routeBounds(editor.track.coordinates), { padding: padding(48) })
})

watch(() => props.focus, (focus) => {
  if (map.value && focus) focusOn(map.value, focus)
})

watch(() => props.hoverPoint, (point) => {
  if (map.value) setRouteHover(map.value, point ?? null)
})
</script>

<template>
  <MapView :bounds="startBounds" @load="onLoad" />
  <MapPoiMarkers v-if="map" :map="map" :pois="editor.pois" />
</template>
