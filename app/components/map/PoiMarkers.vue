<script setup lang="ts">
import type { Map, Marker } from 'maplibre-gl'
import type { Poi } from '#shared/utils/routes'

const props = defineProps<{
  map: Map
  pois: Poi[]
}>()

// MapLibre positions the marker elements; their content is rendered below through teleports, so they can
// use Nuxt UI icons. A click on a marker opens a popup with its type and note.
const markers = shallowRef<{ element: HTMLElement, marker: Marker }[]>([])
let maplibre: typeof import('maplibre-gl') | undefined

const poiText = (poi: Poi) => (poi.note ? `${POI_LABELS[poi.type]} — ${poi.note}` : POI_LABELS[poi.type])

async function sync(pois: Poi[]) {
  maplibre ??= await import('maplibre-gl')
  const next = [...markers.value]
  while (next.length < pois.length) {
    const element = document.createElement('div')
    element.dataset.poiMarker = ''
    const marker = new maplibre.Marker({ element })
      .setLngLat(pois[next.length]!.coordinates)
      .setPopup(new maplibre.Popup({ offset: 18, closeButton: false }))
      .addTo(props.map)
    next.push({ element, marker })
  }
  next.splice(pois.length).forEach(({ marker }) => marker.remove())
  pois.forEach((poi, i) => {
    const { marker } = next[i]!
    marker.setLngLat(poi.coordinates)
    // setText, not setHTML: notes are user content.
    marker.getPopup()?.setText(poiText(poi))
  })
  markers.value = next
}

watch(() => props.pois, sync, { deep: true, immediate: true })

onBeforeUnmount(() => markers.value.forEach(({ marker }) => marker.remove()))
</script>

<template>
  <template v-for="({ element }, i) in markers" :key="i">
    <Teleport v-if="pois[i]" :to="element">
      <span
        class="flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-white text-white shadow-md"
        :style="{ backgroundColor: POI_COLORS[pois[i].type] }"
        :title="poiText(pois[i])"
        role="img"
        :aria-label="poiText(pois[i])"
      >
        <UIcon :name="POI_ICONS[pois[i].type]" class="size-4" />
      </span>
    </Teleport>
  </template>
</template>
