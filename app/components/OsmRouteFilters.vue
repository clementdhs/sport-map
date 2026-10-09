<script setup lang="ts">
import { UDrawer, UPopover } from '#components'
import type { OsmRouteKind } from '#shared/utils/osmRoutes'

// "Filtres" button of the marked routes page (#70), like the home page's: a popover on a computer, a drawer on a
// phone. The filters only hide the routes already loaded.
const discover = useOsmDiscoverStore()
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

// "unit" follows the numbers, e.g. "km" or "m D+".
function rangeLabel([min, max]: [number, number], top: number, unit: string, all: string) {
  if (min === 0 && max === top) return all
  if (max === top) return t('filters.moreThan', { min, unit })
  if (min === 0) return t('filters.lessThan', { max, unit })
  return t('filters.between', { min, max, unit })
}

const distanceLabel = computed(() => rangeLabel(discover.filters.distanceKm, OSM_DISTANCE_MAX_KM, 'km', t('filters.anyDistance')))
const gainLabel = computed(() => rangeLabel(discover.filters.gainM, OSM_GAIN_MAX_M, t('filters.gainUnit'), t('filters.anyGain')))

const shapeItems = computed(() => OSM_SHAPE_FILTERS.map(value => ({ value, label: t(`discover.filters.shapes.${value}`) })))

// Walking routes are graded T1 to T6, MTB ones S0 to S6; the select keeps "all" as a value (null can't be one).
const gradeLabels: Record<OsmRouteKind, (grade: number) => string> = {
  foot: grade => t(`ways.sac.t${grade}`),
  bicycle: () => '',
  mtb: grade => t(`ways.mtb.s${grade}`),
}
const gradeItems = computed(() => [
  { value: 'all', label: t('discover.filters.anyDifficulty') },
  ...OSM_GRADE_CHOICES[discover.kind].map(grade => ({ value: String(grade), label: gradeLabels[discover.kind](grade) })),
])
const maxGrade = computed({
  get: () => discover.filters.maxGrade === null ? 'all' : String(discover.filters.maxGrade),
  set: (value: string) => {
    discover.filters.maxGrade = value === 'all' ? null : Number(value)
  },
})

const scopeItems = computed(() => OSM_ROUTE_SCOPES.map(value => ({ value, label: t(`discover.scopes.${value}`) })))

const buttonLabel = computed(() => {
  const count = discover.activeFilterCount
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
      <UBadge v-if="discover.activeFilterCount" :label="discover.activeFilterCount" size="sm" class="rounded-full" />
    </UButton>

    <template #[panelSlot]>
      <div class="space-y-4" :class="{ 'w-80 p-4': isDesktop }">
        <div class="space-y-2">
          <p class="text-sm text-muted">{{ distanceLabel }}</p>
          <USlider
            v-model="discover.filters.distanceKm"
            :min="0"
            :max="OSM_DISTANCE_MAX_KM"
            :step="1"
            :aria-label="t('filters.distanceLabel')"
          />
        </div>
        <div class="space-y-2">
          <p class="text-sm text-muted">{{ gainLabel }}</p>
          <USlider
            v-model="discover.filters.gainM"
            :min="0"
            :max="OSM_GAIN_MAX_M"
            :step="OSM_GAIN_STEP_M"
            :aria-label="t('filters.gainLabel')"
          />
          <p class="text-xs text-muted">{{ t('discover.filters.gainHint') }}</p>
        </div>
        <USwitch
          v-model="discover.filters.outAndBack"
          :label="t('discover.filters.outAndBack')"
          :description="t('discover.filters.outAndBackHint')"
        />
        <UTabs
          v-model="discover.filters.shape"
          :items="shapeItems"
          :content="false"
          size="sm"
          :aria-label="t('discover.filters.shape')"
        />
        <UFormField
          v-if="OSM_GRADE_CHOICES[discover.kind].length"
          :label="t('discover.filters.difficulty')"
          :help="t('discover.filters.difficultyHint')"
        >
          <USelect v-model="maxGrade" :items="gradeItems" class="w-full" />
        </UFormField>
        <UCheckboxGroup
          v-model="discover.filters.scopes"
          :items="scopeItems"
          :legend="t('discover.filters.scope')"
          orientation="horizontal"
          :ui="{ fieldset: 'gap-x-4 gap-y-2' }"
        />
        <UButton
          v-if="isDesktop"
          :label="t('filters.reset')"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          :disabled="!discover.activeFilterCount && !discover.filters.outAndBack"
          @click="discover.resetFilters"
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
          :disabled="!discover.activeFilterCount && !discover.filters.outAndBack"
          @click="discover.resetFilters"
        />
        <UButton :label="t('filters.showRoutes')" class="flex-1 justify-center" @click="open = false" />
      </div>
    </template>
  </component>
</template>
