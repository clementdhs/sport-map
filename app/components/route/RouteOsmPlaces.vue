<script setup lang="ts">
import type { PlacedOsmPlace } from '#shared/utils/osmPlaces'
import type { LngLat } from '#shared/utils/routes'

// Useful places near the route (#52), in the order they come along it, with the kilometre where one passes them.
// The page searches them (useRouteOsmPlaces); this lists them, with the OpenStreetMap credit the ODbL asks for.
const props = defineProps<{
  places: PlacedOsmPlace[]
  searchedAt: string | null
  searching: boolean
  failure: string | null
}>()
const emit = defineEmits<{
  search: []
  // The place hovered in the list, shown on the map
  hover: [point: LngLat | null]
}>()

const { t } = useI18n()
const { formatDate, formatDistance, formatNumber } = useFormat()

// A town crossed by the route can bring dozens of parkings: the list starts short.
const SHORT_LIST = 8
// Closer than this, a place is on the track (mapping and GPS precision).
const ON_TRACK_M = 20
const expanded = ref(false)
const shown = computed(() => (expanded.value ? props.places : props.places.slice(0, SHORT_LIST)))

function details(place: PlacedOsmPlace) {
  const offset = place.offsetM < ON_TRACK_M
    ? t('osmPlaces.onTrack')
    : t('osmPlaces.offTrack', { distance: formatDistance(Math.round(place.offsetM / 10) * 10) })
  return [place.name, place.ele !== undefined ? `${place.ele} m` : null, offset].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="space-y-2" aria-labelledby="osm-places-title" data-testid="osm-places">
    <div class="flex items-center justify-between gap-2">
      <h2 id="osm-places-title" class="text-base font-semibold">{{ t('osmPlaces.title') }}</h2>
      <UButton
        v-if="searchedAt || failure"
        :label="t('osmPlaces.refresh')"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="sm"
        :loading="searching"
        @click="emit('search')"
      />
    </div>
    <p class="text-sm text-muted">{{ t('osmPlaces.intro', { radius: OSM_PLACES_RADIUS_M }) }}</p>

    <UAlert
      v-if="failure"
      color="warning"
      variant="subtle"
      icon="i-lucide-cloud-alert"
      :title="t('osmPlaces.searchFailed')"
      :description="failure"
    />
    <p v-else-if="searching && !searchedAt" class="flex items-center gap-2 text-sm text-muted" role="status">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />{{ t('osmPlaces.searching') }}
    </p>
    <!-- Never searched: the page was opened offline. -->
    <UButton
      v-else-if="!searchedAt"
      :label="t('osmPlaces.search')"
      icon="i-lucide-search"
      color="neutral"
      variant="outline"
      size="sm"
      @click="emit('search')"
    />
    <p v-else-if="!places.length" class="text-sm">{{ t('osmPlaces.none', { radius: OSM_PLACES_RADIUS_M }) }}</p>

    <ul v-if="places.length" class="space-y-1">
      <li
        v-for="place in shown"
        :key="place.id"
        class="flex items-start gap-3 rounded-md p-2 hover:bg-elevated"
        @mouseenter="emit('hover', place.coordinates)"
        @mouseleave="emit('hover', null)"
      >
        <OsmPlaceIcon :type="place.type" class="mt-0.5" />
        <div class="min-w-0 text-sm">
          <p>
            <span class="font-medium">{{ t(`osmPlaces.types.${place.type}`) }}</span>
            <span class="text-muted"> · km {{ formatNumber(place.alongM / 1000, { maximumFractionDigits: 1 }) }}</span>
          </p>
          <p class="break-words text-muted">{{ details(place) }}</p>
        </div>
      </li>
    </ul>
    <UButton
      v-if="places.length > SHORT_LIST"
      :label="expanded ? t('osmPlaces.showLess') : t('osmPlaces.showAll', { count: places.length })"
      :trailing-icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
      color="neutral"
      variant="link"
      size="sm"
      @click="expanded = !expanded"
    />

    <p class="text-xs text-muted">
      <template v-if="searchedAt">{{ t('osmPlaces.searchedOn', { date: formatDate(searchedAt) }) }} · </template>
      <i18n-t keypath="osmPlaces.attribution" scope="global">
        <template #link>
          <ULink to="https://www.openstreetmap.org/copyright" target="_blank" class="underline">{{ t('discover.osmContributors') }}</ULink>
        </template>
      </i18n-t>
    </p>
  </section>
</template>
