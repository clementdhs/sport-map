<script setup lang="ts">
import type { SearchSort } from '#shared/utils/routes'
import type { MapFocus } from '~/stores/routeSearch'

useSeoMeta({
  title: 'sport-map — parcours de course, rando et vélo',
  description: 'Découvre, crée et partage des parcours de course à pied, randonnée et vélo près de chez toi.',
})

const search = useRouteSearchStore()
const highlightedId = ref<string | null>(null)
const focus = ref<MapFocus | null>(null)

const sortItems = SEARCH_SORTS.map(value => ({ value, label: SEARCH_SORT_LABELS[value] }))

// The search returns at most MAX_SEARCH_RESULTS routes, picked by the selected sort.
const LIMIT_LABELS: Record<SearchSort, string> = {
  nearest: 'les plus proches du centre de la carte',
  recent: 'les plus récents de la zone',
  shortest: 'les plus courts de la zone',
  longest: 'les plus longs de la zone',
  best_rated: 'les mieux notés de la zone',
}

const resultsLabel = computed(() => {
  if (!search.searched) return 'Recherche des parcours…'
  const count = search.results.length
  if (search.textQuery) {
    const words = `« ${search.textQuery} »`
    if (count === 0) return `Aucun parcours pour ${words}`
    if (count >= MAX_SEARCH_RESULTS) return `Les ${count} premiers parcours pour ${words}`
    return `${count} parcours pour ${words}`
  }
  if (count === 0) return 'Aucun parcours dans cette zone'
  if (count >= MAX_SEARCH_RESULTS) return `Les ${count} parcours ${LIMIT_LABELS[search.sort]}`
  return count === 1 ? '1 parcours dans cette zone' : `${count} parcours dans cette zone`
})

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
  <div class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col md:flex-row">
    <div class="relative min-h-0 flex-1">
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
    </div>

    <aside class="max-h-[45dvh] shrink-0 space-y-4 overflow-y-auto border-t border-default p-4 md:max-h-none md:w-96 md:border-t-0 md:border-l">
      <SearchBox @place="focus = $event" />

      <div class="flex gap-2">
        <SearchFilters />
        <USelect
          v-model="search.sort"
          :items="sortItems"
          icon="i-lucide-arrow-down-wide-narrow"
          aria-label="Trier par"
          class="min-w-0 flex-1"
        />
      </div>

      <p class="flex items-center gap-2 text-sm text-muted" aria-live="polite">
        {{ search.failed ? 'La recherche a échoué, déplace la carte pour réessayer.' : resultsLabel }}
        <UIcon v-if="search.loading" name="i-lucide-loader-circle" class="size-4 animate-spin" aria-label="Recherche en cours" />
      </p>

      <!-- Placeholders only for the first search; later ones keep the previous results or hint, dimmed,
           so the list doesn't jump at each map move. -->
      <ul v-if="!search.searched" class="space-y-2" aria-hidden="true">
        <li v-for="i in 3" :key="i">
          <RouteCardSkeleton />
        </li>
      </ul>
      <ul v-else-if="search.results.length" class="space-y-2" :class="{ 'opacity-60': search.loading }">
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
        Essaie d'autres mots ou élargis les filtres.
      </p>
      <p v-else-if="!search.failed" class="text-sm text-muted" :class="{ 'opacity-60': search.loading }">
        Déplace la carte, change les filtres, ou
        <ULink to="/routes/create" class="font-medium text-primary">crée le premier parcours</ULink>.
      </p>
    </aside>
  </div>
</template>
