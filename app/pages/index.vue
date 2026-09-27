<script setup lang="ts">
import type { MapFocus } from '~/stores/routeSearch'

useSeoMeta({
  title: 'sport-map — parcours de course, rando et vélo',
  description: 'Découvre, crée et partage des parcours de course à pied, randonnée et vélo près de chez toi.',
})

const search = useRouteSearchStore()
const highlightedId = ref<string | null>(null)
const focus = ref<MapFocus | null>(null)

const sportItems = [
  { value: 'all', label: 'Tous les sports', icon: 'i-lucide-list' },
  ...SPORT_TYPES.map(value => ({ value, label: SPORT_LABELS[value], icon: SPORT_ICONS[value] })),
]

const distanceLabel = computed(() => {
  const [min, max] = search.distanceKm
  if (min === 0 && max === DISTANCE_FILTER_MAX_KM) return 'Toutes distances'
  if (max === DISTANCE_FILTER_MAX_KM) return `Plus de ${min} km`
  if (min === 0) return `Moins de ${max} km`
  return `De ${min} à ${max} km`
})

const resultsLabel = computed(() => {
  const count = search.results.length
  if (count === 0) return 'Aucun parcours dans cette zone'
  if (count >= MAX_SEARCH_RESULTS) return `Les ${count} parcours les plus proches du centre de la carte`
  return count === 1 ? '1 parcours dans cette zone' : `${count} parcours dans cette zone`
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
      <PlaceSearch @select="focus = $event" />

      <div class="grid grid-cols-2 gap-3">
        <USelect v-model="search.sport" :items="sportItems" aria-label="Sport" class="w-full" />
        <div class="space-y-2">
          <p class="text-sm text-muted">{{ distanceLabel }}</p>
          <USlider
            v-model="search.distanceKm"
            :min="0"
            :max="DISTANCE_FILTER_MAX_KM"
            :step="5"
            aria-label="Distance du parcours, en kilomètres"
          />
        </div>
      </div>

      <USeparator />

      <p class="flex items-center gap-2 text-sm text-muted" aria-live="polite">
        {{ search.failed ? 'La recherche a échoué, déplace la carte pour réessayer.' : resultsLabel }}
        <UIcon v-if="search.loading" name="i-lucide-loader-circle" class="size-4 animate-spin" aria-label="Recherche en cours" />
      </p>

      <ul v-if="search.results.length" class="space-y-2" :class="{ 'opacity-60': search.loading }">
        <li
          v-for="route in search.results"
          :key="route.id"
          @mouseenter="highlightedId = route.id"
          @mouseleave="highlightedId = null"
        >
          <RouteCard :route="route" :highlighted="highlightedId === route.id" />
        </li>
      </ul>
      <p v-else-if="!search.loading && !search.failed" class="text-sm text-muted">
        Déplace la carte, change les filtres, ou
        <ULink to="/routes/create" class="font-medium text-primary">crée le premier parcours</ULink>.
      </p>
    </aside>
  </div>
</template>
