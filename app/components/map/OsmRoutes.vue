<script setup lang="ts">
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent, MapMouseEvent, MapTouchEvent, Popup } from 'maplibre-gl'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'
import type { SectionEnd } from '~/stores/osmSection'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'
import type { OsmSectionLayerData } from '~/utils/osmRouteLayers'

// Marked routes of OpenStreetMap (#69): hovering one highlights it, clicking it selects it in the list. While a
// section of one is chosen (#72), tapping the route places an end, and the ends are dragged along it.
const props = defineProps<{
  routes: OsmRoute[]
  // Hovered or selected route, drawn on top.
  highlightedId: number | null
  // A new object moves the map there (a place picked in the search box, a route picked in the list).
  focus: MapFocus | null
  center: LngLat
  zoom: number
  label: (route: OsmRoute) => string
  section: OsmSectionLayerData | null
}>()

const emit = defineEmits<{
  viewChange: [view: MapViewState]
  hover: [id: number | null]
  select: [id: number]
  pick: [point: LngLat]
  moveEnd: [end: SectionEnd, point: LngLat]
}>()

const map = shallowRef<Map>()
const { focusOn } = useMapPadding()
let popup: Popup | undefined

async function onLoad(instance: Map) {
  const { Popup } = await import('maplibre-gl')
  popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 })
  addOsmRouteLayers(instance)
  addOsmSectionLayers(instance)
  setOsmRoutes(instance, props.routes, props.label)
  setOsmRouteHighlight(instance, props.highlightedId)
  setOsmSection(instance, props.section)

  instance.on('mousemove', OSM_ROUTES_HIT_LAYER, (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature || dragging) return
    instance.getCanvas().style.cursor = 'pointer'
    if (props.section) return
    emit('hover', feature.properties.id)
    // setText, not setHTML: names come from OpenStreetMap.
    popup!.setLngLat(event.lngLat).setText(feature.properties.name).addTo(instance)
  })
  instance.on('mouseleave', OSM_ROUTES_HIT_LAYER, () => {
    if (dragging) return
    instance.getCanvas().style.cursor = ''
    emit('hover', null)
    popup!.remove()
  })
  instance.on('click', OSM_ROUTES_HIT_LAYER, (event: MapLayerMouseEvent) => {
    if (props.section) {
      // A click on an end without moving it.
      if (!instance.queryRenderedFeatures(event.point, { layers: [OSM_SECTION_ENDS_HIT_LAYER] }).length) {
        emit('pick', [event.lngLat.lng, event.lngLat.lat])
      }
      return
    }
    const id = event.features?.[0]?.properties.id
    if (typeof id === 'number') emit('select', id)
  })
  instance.on('mouseenter', OSM_SECTION_ENDS_HIT_LAYER, () => {
    if (!dragging) instance.getCanvas().style.cursor = 'grab'
  })
  instance.on('mouseleave', OSM_SECTION_ENDS_HIT_LAYER, () => {
    if (!dragging) instance.getCanvas().style.cursor = ''
  })
  instance.on('mousedown', OSM_SECTION_ENDS_HIT_LAYER, event => startDrag(instance, event))
  instance.on('touchstart', OSM_SECTION_ENDS_HIT_LAYER, event => startDrag(instance, event))
  instance.on('moveend', () => emit('viewChange', mapViewState(instance)))

  map.value = instance
  emit('viewChange', mapViewState(instance))
}

// The end being dragged, moved along the route at each step.
let dragging: SectionEnd | null = null

function startDrag(instance: Map, event: MapLayerMouseEvent | MapLayerTouchEvent) {
  const end = event.features?.[0]?.properties.end as SectionEnd | undefined
  if (!end || ('touches' in event.originalEvent && event.originalEvent.touches.length > 1)) return
  // Keeps the map still.
  event.preventDefault()
  dragging = end
  instance.getCanvas().style.cursor = 'grabbing'
  const isTouch = event.type === 'touchstart'
  instance.on(isTouch ? 'touchmove' : 'mousemove', onDragMove)
  // On the window: the pointer may be released outside the map.
  window.addEventListener(isTouch ? 'touchend' : 'mouseup', onDragEnd, { once: true })
}

function onDragMove(event: MapMouseEvent | MapTouchEvent) {
  if (dragging) emit('moveEnd', dragging, [event.lngLat.lng, event.lngLat.lat])
}

function onDragEnd() {
  dragging = null
  const instance = map.value
  if (!instance) return
  instance.off('mousemove', onDragMove)
  instance.off('touchmove', onDragMove)
  instance.getCanvas().style.cursor = ''
}

watch(() => props.section, (section) => {
  if (section) popup?.remove()
  if (map.value) setOsmSection(map.value, section)
})

watch(() => props.routes, (routes) => {
  if (map.value) setOsmRoutes(map.value, routes, props.label)
})

watch(() => props.highlightedId, (id) => {
  if (map.value) setOsmRouteHighlight(map.value, id)
})

watch(() => props.focus, (focus) => {
  if (map.value && focus) focusOn(map.value, focus)
})
</script>

<template>
  <MapView :center="center" :zoom="zoom" @load="onLoad" />
</template>
