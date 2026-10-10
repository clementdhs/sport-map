<script setup lang="ts">
import type { SearchSort } from '#shared/utils/routes'
import type { MapFocus } from '~/stores/routeSearch'

// Map page: MapSheetLayout replaces the header with its floating top bar.
definePageMeta({ layout: false })
const { t } = useI18n()
useSeoMeta({
  title: () => t('home.seoTitle'),
  description: () => t('home.seoDescription'),
})

const search = useRouteSearchStore()
const discover = useOsmDiscoverStore()
const highlightedId = ref<string | null>(null)
const focus = ref<MapFocus | null>(null)

const sortItems = computed(() => SEARCH_SORTS.map(value => ({ value, label: t(`sorts.${value}`) })))

// The search returns at most MAX_SEARCH_RESULTS routes, picked by the selected sort (home.limit.<sort>).
const resultsLabel = computed(() => {
  if (!search.searched) return t('home.searching')
  const count = search.results.length
  if (search.textQuery) {
    const query = search.textQuery
    if (count === 0) return t('home.textNone', { query })
    if (count >= MAX_SEARCH_RESULTS) return t('home.textFirst', { count, query })
    return t('home.textCount', { query, count }, count)
  }
  if (count === 0) return t('home.zoneNone')
  if (count >= MAX_SEARCH_RESULTS) return t(`home.limit.${search.sort satisfies SearchSort}`, { count })
  return t('home.zoneCount', count)
})

const statusLabel = computed(() => search.failed ? t('home.failed') : resultsLabel.value)

// A text search looks everywhere: once its first results arrive, frame them on the map.
let fitResults = false
watch(() => search.textQuery, (textQuery) => {
  fitResults = !!textQuery
})
watch(() => search.results, (results) => {
  if (!fitResults || !results.length) return
  fitResults = false
  if (results.length === 1) {
    focus.value = { center: results[0]!.marker }
    return
  }
  const lngs = results.map(({ marker }) => marker[0])
  const lats = results.map(({ marker }) => marker[1])
  focus.value = {
    center: results[0]!.marker,
    bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
  }
})
</script>

<template>
  <MapSheetLayout>
    <template #map>
      <ClientOnly>
        <MapRouteSearch
          :results="search.results"
          :highlighted-id="highlightedId"
          :focus="focus"
          :center="search.view.center"
          :zoom="search.view.zoom"
          @view-change="search.setView"
          @hover="highlightedId = $event"
        />
      </ClientOnly>
    </template>

    <template #actions>
      <UButton
        to="/record"
        icon="i-lucide-circle-dot"
        :label="t('mapBar.record')"
        :aria-label="t('header.record')"
        color="neutral"
        variant="outline"
      />
      <UButton to="/routes/create" icon="i-lucide-plus" :label="t('mapBar.create')" :aria-label="t('header.create')" />
    </template>

    <template #title>
      <span class="flex items-center gap-2">
        <span class="truncate">{{ statusLabel }}</span>
        <UIcon v-if="search.loading" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
      </span>
    </template>

    <LiveSharesBanner />
    <SearchBox @place="focus = $event" />

    <div class="flex gap-2">
      <SearchFilters />
      <USelect
        v-model="search.sort"
        :items="sortItems"
        icon="i-lucide-arrow-down-wide-narrow"
        :aria-label="t('home.sortBy')"
        class="min-w-0 flex-1"
      />
    </div>

    <ULink to="/discover" class="flex items-center gap-2 text-sm font-medium text-primary" @click="discover.startFrom(search.view)">
      <UIcon name="i-lucide-signpost" class="size-4 shrink-0" />{{ t('home.discoverOsm') }}
    </ULink>

    <!-- Shown by the sheet title on mobile, still read out from here. -->
    <p class="flex items-center gap-2 text-sm text-muted max-md:sr-only" aria-live="polite">
      {{ statusLabel }}
      <UIcon v-if="search.loading" name="i-lucide-loader-circle" class="size-4 animate-spin" :aria-label="t('home.loading')" />
    </p>

    <!-- Placeholders only for the first search; later ones keep the previous results or hint, dimmed,
         so the list doesn't jump at each map move. -->
    <ul v-if="!search.searched" class="space-y-2" aria-hidden="true">
      <li v-for="i in 3" :key="i">
        <RouteCardSkeleton />
      </li>
    </ul>
    <ul v-else-if="search.results.length" class="space-y-2" :class="{ 'opacity-60': search.loading }" data-testid="route-results">
      <li
        v-for="route in search.results"
        :key="route.id"
        @mouseenter="highlightedId = route.id"
        @mouseleave="highlightedId = null"
      >
        <RouteCard :route="route" :highlighted="highlightedId === route.id" />
      </li>
    </ul>
    <p v-else-if="!search.failed && search.textQuery" class="text-sm text-muted" :class="{ 'opacity-60': search.loading }">
      {{ t('home.textEmptyHint') }}
    </p>
    <p v-else-if="!search.failed" class="text-sm text-muted" :class="{ 'opacity-60': search.loading }">
      <i18n-t keypath="home.zoneEmptyHint" scope="global">
        <template #link>
          <ULink to="/routes/create" class="font-medium text-primary">{{ t('home.createFirst') }}</ULink>
        </template>
      </i18n-t>
    </p>
  </MapSheetLayout>
</template>
