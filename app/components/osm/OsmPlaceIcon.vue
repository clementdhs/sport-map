<script setup lang="ts">
import type { OsmPlaceType } from '#shared/utils/osmPlaces'

// A useful place from OpenStreetMap (#52), on the map, in the list and in the legend: smaller than the route's own
// points of interest and white, so the two never get mixed up; the icon tells the type. The same in both themes,
// like the map's other symbols.
defineProps<{ type: OsmPlaceType }>()
</script>

<template>
  <span class="flex size-6 shrink-0 items-center justify-center rounded-full border border-neutral-400 bg-white text-neutral-700 shadow-sm">
    <UIcon :name="OSM_PLACE_ICONS[type]" class="size-3.5" />
  </span>
</template>
