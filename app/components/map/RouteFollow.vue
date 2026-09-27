<script setup lang="ts">
import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map } from 'maplibre-gl'
import type { LngLat } from '#shared/utils/routes'
import type { GpsFix } from '~/composables/useWatchPosition'

const props = defineProps<{
  coordinates: LngLat[]
  fix: GpsFix | null
  // Keep the position centered; the parent turns it off when the user moves the map.
  follow: boolean
}>()

const emit = defineEmits<{
  stopFollow: []
}>()

const GPS_SOURCE = 'gps-position'
const GPS_COLOR = '#2563eb'

const map = shallowRef<Map>()

// The accuracy halo is sized in meters: its radius in pixels depends on the zoom and latitude.
function haloRadiusPx(instance: Map, fix: GpsFix): number {
  const metersPerPixel = (40_075_016.686 * Math.cos((fix.position[1] * Math.PI) / 180)) / (512 * 2 ** instance.getZoom())
  return Math.min(fix.accuracyM / metersPerPixel, 400)
}

function gpsData(instance: Map, fix: GpsFix | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: fix
      ? [{ type: 'Feature', properties: { halo: haloRadiusPx(instance, fix) }, geometry: { type: 'Point', coordinates: fix.position } }]
      : [],
  }
}

function updateGps() {
  map.value?.getSource<GeoJSONSource>(GPS_SOURCE)?.setData(gpsData(map.value, props.fix))
}

function onLoad(instance: Map) {
  addRouteLayers(instance, {
    line: props.coordinates,
    points: [props.coordinates[0]!, props.coordinates.at(-1)!],
  })
  instance.fitBounds(routeBounds(props.coordinates), { padding: 48, duration: 0 })

  instance.addSource(GPS_SOURCE, { type: 'geojson', data: gpsData(instance, props.fix) })
  instance.addLayer({
    id: 'gps-halo',
    type: 'circle',
    source: GPS_SOURCE,
    paint: { 'circle-radius': ['get', 'halo'], 'circle-color': GPS_COLOR, 'circle-opacity': 0.15 },
  })
  instance.addLayer({
    id: 'gps-dot',
    type: 'circle',
    source: GPS_SOURCE,
    paint: { 'circle-radius': 8, 'circle-color': GPS_COLOR, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
  })

  instance.on('zoom', updateGps)
  // Only gestures (originalEvent) stop the following, not the map's own easing.
  instance.on('dragstart', event => event.originalEvent && emit('stopFollow'))
  map.value = instance
  // The GPS may have answered before the map was ready.
  if (props.fix && props.follow) center(props.fix)
}

// The first centering zooms in to walking scale; the next ones only pan.
let zoomedIn = false
function center(fix: GpsFix) {
  const instance = map.value
  if (!instance) return
  if (zoomedIn) {
    instance.easeTo({ center: fix.position, duration: 500 })
    return
  }
  instance.flyTo({ center: fix.position, zoom: Math.max(instance.getZoom(), 16) })
  zoomedIn = true
}

watch(() => props.fix, (fix) => {
  updateGps()
  if (fix && props.follow) center(fix)
})

watch(() => props.follow, (follow) => {
  if (follow && props.fix) center(props.fix)
})
</script>

<template>
  <MapView @load="onLoad" />
</template>
