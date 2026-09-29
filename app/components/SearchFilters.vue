<script setup lang="ts">
import { UDrawer, UPopover } from '#components'

// "Filtres" button of the home page: a popover on a computer, a drawer on a phone.
const search = useRouteSearchStore()
const open = ref(false)

// Same breakpoint as the page layout (md). Starts as a phone so hydration matches the server.
const isDesktop = ref(false)
onMounted(() => {
  const query = window.matchMedia('(min-width: 768px)')
  isDesktop.value = query.matches
  query.addEventListener('change', (event) => {
    isDesktop.value = event.matches
  })
})
const panelSlot = computed(() => isDesktop.value ? 'content' : 'body')

const sportItems = [
  { value: 'all', label: 'Tous les sports', icon: 'i-lucide-list' },
  ...SPORT_TYPES.map(value => ({ value, label: SPORT_LABELS[value], icon: SPORT_ICONS[value] })),
]

// "unit" follows the numbers, e.g. "km" or "m D+".
function rangeLabel([min, max]: [number, number], top: number, unit: string, all: string) {
  if (min === 0 && max === top) return all
  if (max === top) return `Plus de ${min} ${unit}`
  if (min === 0) return `Moins de ${max} ${unit}`
  return `De ${min} à ${max} ${unit}`
}

const distanceLabel = computed(() => rangeLabel(search.distanceKm, DISTANCE_FILTER_MAX_KM, 'km', 'Toutes distances'))
const gainLabel = computed(() => rangeLabel(search.gainM, GAIN_FILTER_MAX_M, 'm D+', 'Tout dénivelé'))

const buttonLabel = computed(() => {
  const count = search.activeFilterCount
  if (!count) return 'Filtres'
  return count === 1 ? 'Filtres, 1 actif' : `Filtres, ${count} actifs`
})
</script>

<template>
  <component
    :is="isDesktop ? UPopover : UDrawer"
    v-model:open="open"
    v-bind="isDesktop ? { content: { align: 'start' } } : { title: 'Filtres' }"
  >
    <UButton icon="i-lucide-sliders-horizontal" color="neutral" variant="outline" :aria-label="buttonLabel">
      Filtres
      <UBadge v-if="search.activeFilterCount" :label="search.activeFilterCount" size="sm" class="rounded-full" />
    </UButton>

    <template #[panelSlot]>
      <div class="space-y-4" :class="{ 'w-80 p-4': isDesktop }">
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
        <div class="space-y-2">
          <p class="text-sm text-muted">{{ gainLabel }}</p>
          <USlider
            v-model="search.gainM"
            :min="0"
            :max="GAIN_FILTER_MAX_M"
            :step="50"
            aria-label="Dénivelé positif du parcours, en mètres"
          />
        </div>
        <USwitch
          v-model="search.passingThrough"
          label="Passant par la zone"
          :description="search.textQuery
            ? 'Sans effet pendant une recherche par nom, qui porte sur tous les parcours.'
            : 'Aussi les parcours qui traversent la carte sans y démarrer.'"
          :disabled="!!search.textQuery"
        />
        <USwitch v-model="search.loopsOnly" label="Boucles uniquement" description="Arrivée à moins de 200 m du départ." />
        <UButton
          v-if="isDesktop"
          label="Réinitialiser"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          :disabled="!search.activeFilterCount"
          @click="search.resetFilters"
        />
      </div>
    </template>

    <template v-if="!isDesktop" #footer>
      <div class="flex gap-2">
        <UButton
          label="Réinitialiser"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="outline"
          :disabled="!search.activeFilterCount"
          @click="search.resetFilters"
        />
        <UButton label="Voir les parcours" class="flex-1 justify-center" @click="open = false" />
      </div>
    </template>
  </component>
</template>
