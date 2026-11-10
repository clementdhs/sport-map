<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import type { LngLat, Poi } from '#shared/utils/routes'
import type { Flyover } from '~/composables/useFlyover'

const props = defineProps<{
  coordinates: LngLat[]
  pois?: Poi[]
  // Numbered steps rather than typed points (#233, the route page)
  numberedPois?: boolean
  // Useful places from OpenStreetMap (#52), shown unless the member turned them off in the "Calques" panel
  osmPlaces?: OsmPlace[]
  // line-gradient colouring the track (slopes, surface or difficulty), null for the plain route colour
  lineGradient?: unknown[] | null
  // Position hovered on the elevation profile
  hoverPoint?: LngLat | null
  // The page's flyover (#74), which moves this map's camera
  flyover?: Flyover
}>()

const map = shallowRef<Map>()
const { padding } = useMapPadding()
const { t } = useI18n()
const showOsmPlaces = usePreference('osmPlaces')

function onLoad(instance: Map) {
  addRouteLayers(instance, {
    line: props.coordinates,
    points: [props.coordinates[0]!, props.coordinates.at(-1)!],
  })
  instance.fitBounds(routeBounds(props.coordinates), { padding: padding(48), duration: 0 })
  if (props.lineGradient) setRouteGradient(instance, props.lineGradient)
  map.value = instance
  // The moving point stays between the top bar and the open sheet.
  props.flyover?.attach(instance, () => padding(0))
}

watch(() => props.lineGradient, (gradient) => {
  if (map.value) setRouteGradient(map.value, gradient ?? null)
})

watch(() => props.hoverPoint, (point) => {
  if (map.value) setRouteHover(map.value, point ?? null)
})
</script>

<template>
  <MapView relief :force3d="!!flyover?.subject" @load="onLoad">
    <template v-if="$slots.controls || osmPlaces?.length" #controls>
      <USwitch v-if="osmPlaces?.length" v-model="showOsmPlaces" :label="t('osmPlaces.layer')" size="sm" />
      <slot name="controls" />
    </template>
  </MapView>
  <MapOsmPlaces v-if="map && showOsmPlaces && osmPlaces?.length" :map="map" :places="osmPlaces" />
  <MapPoiMarkers v-if="map && pois?.length" :map="map" :pois="pois" :numbered="numberedPois" />
</template>
