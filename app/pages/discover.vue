<script setup lang="ts">
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'

// Marked routes of OpenStreetMap around the map view (#69). Map page: MapSheetLayout replaces the header with its
// floating top bar.
definePageMeta({ layout: false })
const { t } = useI18n()
const { formatDistance } = useFormat()
const errorMessage = useErrorMessage()
useSeoMeta({ title: () => `${t('discover.title')} — sport-map` })

const discover = useOsmDiscoverStore()
const focus = ref<MapFocus | null>(null)

const kindItems = computed(() => OSM_ROUTE_KINDS.map(value =>
  ({ value, label: t(`discover.kinds.${value}`), icon: SPORT_ICONS[OSM_KIND_SPORTS[value]] })))

const label = (route: OsmRoute) => route.name ?? route.ref ?? t('discover.unnamed')
const scopeOf = (route: OsmRoute) => osmRouteScope(route.network)
const shownId = computed(() => discover.highlightedId ?? discover.selectedId)

// The first view of the map starts a search, unless results already cover it (coming back from the editor).
let viewKnown = false
function onViewChange(view: MapViewState) {
  discover.setView(view)
  if (!viewKnown) {
    viewKnown = true
    discover.searchIfNeeded()
  }
}

const statusLabel = computed(() => {
  if (discover.loading) return t('discover.searching')
  if (discover.error) return t('discover.failed')
  if (!discover.searched) return discover.tooWide ? t('discover.zoomIn') : t('discover.title')
  return discover.routes.length ? t('discover.count', { count: discover.routes.length }, discover.routes.length) : t('discover.none')
})

// Picked in the list: framed on the map. Picked on the map: shown in the list.
function selectInList(route: OsmRoute) {
  discover.selectedId = route.id
  const bbox = osmRouteBbox(route)
  focus.value = { center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], bbox }
}

async function selectOnMap(id: number) {
  discover.selectedId = id
  await nextTick()
  document.getElementById(`osm-route-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
</script>

<template>
  <MapSheetLayout back="/">
    <template #map>
      <ClientOnly>
        <MapOsmRoutes
          :routes="discover.routes"
          :highlighted-id="shownId"
          :focus="focus"
          :center="discover.view.center"
          :zoom="discover.view.zoom"
          :label="label"
          @view-change="onViewChange"
          @hover="discover.highlightedId = $event"
          @select="selectOnMap"
        />
      </ClientOnly>
    </template>

    <template #search>
      <SearchBox places-only @place="focus = $event" />
    </template>

    <template #title>
      <span class="flex items-center gap-2">
        <span class="truncate">{{ statusLabel }}</span>
        <UIcon v-if="discover.loading" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
      </span>
    </template>

    <h1 class="text-lg font-semibold max-md:sr-only">{{ t('discover.title') }}</h1>

    <UTabs v-model="discover.kind" :items="kindItems" :content="false" size="sm" :aria-label="t('discover.kind')" />

    <template v-if="!discover.viewSearched">
      <UButton
        icon="i-lucide-search"
        :label="t('discover.searchHere')"
        block
        :loading="discover.loading"
        :disabled="discover.tooWide"
        @click="discover.search()"
      />
      <p v-if="discover.tooWide" class="-mt-2 text-sm text-muted">
        <UIcon name="i-lucide-zoom-in" class="mr-1 align-text-bottom" />{{ t('discover.zoomInHint') }}
      </p>
    </template>

    <!-- Shown by the sheet title on mobile, still read out from here. -->
    <p class="flex items-center gap-2 text-sm text-muted max-md:sr-only" aria-live="polite">
      {{ statusLabel }}
      <UIcon v-if="discover.loading" name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
    </p>

    <UAlert
      v-if="discover.error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('discover.failed')"
      :description="errorMessage(discover.error)"
      :actions="[{ label: t('discover.retry'), color: 'neutral', variant: 'outline', onClick: () => discover.search() }]"
    />

    <ul v-if="discover.routes.length" class="space-y-2" :class="{ 'opacity-60': discover.loading }" :aria-label="t('discover.results')">
      <li v-for="route in discover.routes" :id="`osm-route-${route.id}`" :key="route.id">
        <button
          type="button"
          class="w-full rounded-md border p-3 text-left"
          :class="shownId === route.id ? 'border-primary' : 'border-default'"
          :aria-pressed="discover.selectedId === route.id"
          @mouseenter="discover.highlightedId = route.id"
          @mouseleave="discover.highlightedId = null"
          @focus="discover.highlightedId = route.id"
          @blur="discover.highlightedId = null"
          @click="selectInList(route)"
        >
          <span class="block font-medium">{{ label(route) }}</span>
          <span class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{{ formatDistance(route.distance_m) }}</span>
            <UBadge v-if="scopeOf(route)" :label="t(`discover.scopes.${scopeOf(route)}`)" color="neutral" variant="subtle" size="sm" />
            <UBadge v-if="route.name && route.ref" :label="route.ref" color="neutral" variant="outline" size="sm" />
            <UBadge v-if="!route.complete" :label="t('discover.incomplete')" icon="i-lucide-unlink" color="warning" variant="subtle" size="sm" />
          </span>
        </button>
        <p v-if="discover.selectedId === route.id && !route.complete" class="mt-1 px-1 text-sm text-muted">
          {{ t('discover.incompleteHint') }}
        </p>
      </li>
    </ul>
    <p v-else-if="discover.searched && !discover.loading && !discover.error" class="text-sm text-muted">
      {{ t('discover.noneHint') }}
    </p>

    <p class="text-xs text-muted">
      <i18n-t keypath="discover.attribution" scope="global">
        <template #link>
          <ULink to="https://www.openstreetmap.org/copyright" target="_blank" class="underline">{{ t('discover.osmContributors') }}</ULink>
        </template>
      </i18n-t>
    </p>
  </MapSheetLayout>
</template>
