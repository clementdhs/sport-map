<script setup lang="ts">
import { lineString, nearestPointOnLine } from '@turf/turf'
import type { Map, MapMouseEvent, MapTouchEvent, PointLike } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'
import type { MapFocus } from '~/stores/routeSearch'

const props = defineProps<{
  // Position hovered on the elevation profile
  hoverPoint?: LngLat | null
  // A new object moves the map there (a place picked in the search box), without touching the track.
  focus?: MapFocus | null
}>()

const editor = useRouteEditorStore()
const map = shallowRef<Map>()
const { padding, focusOn } = useMapPadding()

// Moves under this distance (px) count as a click, not a drag.
const DRAG_THRESHOLD_PX = 4

type Drag =
  | { kind: 'move', waypointIndex: number, start: { x: number, y: number }, position: LngLat | null }
  | { kind: 'insert', segmentIndex: number, start: { x: number, y: number }, position: LngLat | null }

// position stays null until the pointer has really moved.
const drag = shallowRef<Drag | null>(null)

// While dragging, the edited segments are previewed as straight lines until the real ones are computed.
const layerData = computed(() => {
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
  if (editor.placingPoi || isMultiTouch(event) || ('button' in event.originalEvent && event.originalEvent.button !== 0)) return
  const index = pointsAt(instance, event.point)[0]?.properties.index as number | undefined
  if (index === undefined || !editor.canEditWaypoint(index)) return
  startDrag(instance, event, { kind: 'move', waypointIndex: index, start: event.point, position: null })
}

function onLineDown(instance: Map, event: MapMouseEvent | MapTouchEvent) {
  if (editor.placingPoi || isMultiTouch(event) || ('button' in event.originalEvent && event.originalEvent.button !== 0)) return
  // Points are drawn over the line: grabbing a point must not also grab the line.
  if (pointsAt(instance, event.point).length) return
  const segmentIndex = nearestSegmentIndex([event.lngLat.lng, event.lngLat.lat])
  if (!editor.canInsertInSegment(segmentIndex)) return
  startDrag(instance, event, { kind: 'insert', segmentIndex, start: event.point, position: null })
}

function onLoad(instance: Map) {
  addRouteLayers(instance, layerData.value, { editable: true })
  const canvas = instance.getCanvas()
  canvas.style.cursor = 'crosshair'

  instance.on('click', (event: MapMouseEvent) => {
    if (isOnPoiMarker(event)) return
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
  map.value = instance
}

watch(layerData, (data) => {
  if (map.value) setRouteLayerData(map.value, data)
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
  <MapView @load="onLoad" />
  <MapPoiMarkers v-if="map" :map="map" :pois="editor.pois" />
</template>
