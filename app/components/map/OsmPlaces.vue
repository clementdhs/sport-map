<script setup lang="ts">
import type { GeoJSONSourceSpecification, Map, Marker } from 'maplibre-gl'
import type { OsmPlace } from '#shared/utils/osmPlaces'

const props = defineProps<{
  map: Map
  places: OsmPlace[]
}>()

// Useful places near the route (#52), as HTML markers like the route's points of interest (MapPoiMarkers), whose
// content is teleported so it can use Nuxt UI icons. Placed below those in the DOM, so that they stay on top.
const markers = shallowRef<{ element: HTMLElement, marker: Marker }[]>([])
let maplibre: typeof import('maplibre-gl') | undefined

const { t } = useI18n()
const placeText = (place: OsmPlace) => [
  t(`osmPlaces.types.${place.type}`),
  place.name && ` — ${place.name}`,
  place.ele !== undefined && ` (${place.ele} m)`,
].filter(Boolean).join('')

// Markers don't feed MapLibre's attribution: an empty source and an invisible layer carry the ODbL credit
// whatever the basemap, as long as the places are shown.
const ATTRIBUTION_SOURCE = 'osm-places-attribution'
const attribution: GeoJSONSourceSpecification = {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  attribution: OSM_ATTRIBUTION,
}

function addAttribution() {
  if (props.map.getSource(ATTRIBUTION_SOURCE)) return
  props.map.addSource(ATTRIBUTION_SOURCE, attribution)
  props.map.addLayer({ id: ATTRIBUTION_SOURCE, type: 'circle', source: ATTRIBUTION_SOURCE, paint: { 'circle-opacity': 0 } })
}

async function sync(places: OsmPlace[]) {
  maplibre ??= await import('maplibre-gl')
  const next = [...markers.value]
  while (next.length < places.length) {
    const element = document.createElement('div')
    element.dataset.osmPlaceMarker = ''
    const marker = new maplibre.Marker({ element })
      .setLngLat(places[next.length]!.coordinates)
      .setPopup(new maplibre.Popup({ offset: 14, closeButton: false }))
      .addTo(props.map)
    // Right after the canvas, below the POI markers even when those were added first (places found after load).
    props.map.getCanvasContainer().insertBefore(element, props.map.getCanvas().nextSibling)
    next.push({ element, marker })
  }
  next.splice(places.length).forEach(({ marker }) => marker.remove())
  places.forEach((place, i) => {
    const { marker } = next[i]!
    marker.setLngLat(place.coordinates)
    // setText: names come from OpenStreetMap.
    marker.getPopup()?.setText(placeText(place))
  })
  markers.value = next
}

watch(() => props.places, sync, { immediate: true })
onMounted(addAttribution)

onBeforeUnmount(() => {
  markers.value.forEach(({ marker }) => marker.remove())
  try {
    if (props.map.getLayer(ATTRIBUTION_SOURCE)) props.map.removeLayer(ATTRIBUTION_SOURCE)
    if (props.map.getSource(ATTRIBUTION_SOURCE)) props.map.removeSource(ATTRIBUTION_SOURCE)
  }
  catch {
    // The map went with the page.
  }
})
</script>

<template>
  <template v-for="({ element }, i) in markers" :key="i">
    <Teleport v-if="places[i]" :to="element">
      <span class="block cursor-pointer" :title="placeText(places[i])" role="img" :aria-label="placeText(places[i])">
        <OsmPlaceIcon :type="places[i].type" />
      </span>
    </Teleport>
  </template>
</template>
