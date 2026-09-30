<script setup lang="ts">
import { UDrawer, UPopover } from '#components'

// "Filtres" button of the home page: a popover on a computer, a drawer on a phone.
const search = useRouteSearchStore()
const { t } = useI18n()
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

const sportItems = computed(() => [
  { value: 'all', label: t('filters.allSports'), icon: 'i-lucide-list' },
  ...SPORT_TYPES.map(value => ({ value, label: t(`sports.${value}`), icon: SPORT_ICONS[value] })),
])

// "unit" follows the numbers, e.g. "km" or "m D+".
function rangeLabel([min, max]: [number, number], top: number, unit: string, all: string) {
  if (min === 0 && max === top) return all
  if (max === top) return t('filters.moreThan', { min, unit })
  if (min === 0) return t('filters.lessThan', { max, unit })
  return t('filters.between', { min, max, unit })
}

const distanceLabel = computed(() => rangeLabel(search.distanceKm, DISTANCE_FILTER_MAX_KM, 'km', t('filters.anyDistance')))
const gainLabel = computed(() => rangeLabel(search.gainM, GAIN_FILTER_MAX_M, t('filters.gainUnit'), t('filters.anyGain')))

const buttonLabel = computed(() => {
  const count = search.activeFilterCount
  return count ? t('filters.buttonActive', count) : t('filters.title')
})
</script>

<template>
  <component
    :is="isDesktop ? UPopover : UDrawer"
    v-model:open="open"
    v-bind="isDesktop ? { content: { align: 'start' } } : { title: t('filters.title') }"
  >
    <UButton icon="i-lucide-sliders-horizontal" color="neutral" variant="outline" :aria-label="buttonLabel">
      {{ t('filters.title') }}
      <UBadge v-if="search.activeFilterCount" :label="search.activeFilterCount" size="sm" class="rounded-full" />
    </UButton>

    <template #[panelSlot]>
      <div class="space-y-4" :class="{ 'w-80 p-4': isDesktop }">
        <USelect v-model="search.sport" :items="sportItems" :aria-label="t('filters.sport')" class="w-full" />
        <div class="space-y-2">
          <p class="text-sm text-muted">{{ distanceLabel }}</p>
          <USlider
            v-model="search.distanceKm"
            :min="0"
            :max="DISTANCE_FILTER_MAX_KM"
            :step="5"
            :aria-label="t('filters.distanceLabel')"
          />
        </div>
        <div class="space-y-2">
          <p class="text-sm text-muted">{{ gainLabel }}</p>
          <USlider
            v-model="search.gainM"
            :min="0"
            :max="GAIN_FILTER_MAX_M"
            :step="50"
            :aria-label="t('filters.gainLabel')"
          />
        </div>
        <USwitch
          v-model="search.passingThrough"
          :label="t('filters.passingThrough')"
          :description="search.textQuery ? t('filters.passingThroughDisabled') : t('filters.passingThroughHint')"
          :disabled="!!search.textQuery"
        />
        <USwitch v-model="search.loopsOnly" :label="t('filters.loopsOnly')" :description="t('filters.loopsOnlyHint')" />
        <UButton
          v-if="isDesktop"
          :label="t('filters.reset')"
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
          :label="t('filters.reset')"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="outline"
          :disabled="!search.activeFilterCount"
          @click="search.resetFilters"
        />
        <UButton :label="t('filters.showRoutes')" class="flex-1 justify-center" @click="open = false" />
      </div>
    </template>
  </component>
</template>
