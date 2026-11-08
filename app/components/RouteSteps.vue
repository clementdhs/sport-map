<script setup lang="ts">
import type { LngLat, Poi, SportType } from '#shared/utils/routes'
import type { RouteStep } from '~/utils/routeSteps'

// "Étapes" of the route page (#233): the author's points of interest as signs on a post, numbered as on the map
// and the profile, with where one passes them and when (estimated at the member's pace, #146), then the arrival
// on the yellow of the signs.
const props = defineProps<{
  steps: RouteStep<Poi>[]
  sport: SportType
  distanceM: number
  elevationGainM: number | null
  isLoop: boolean
}>()

const emit = defineEmits<{
  hover: [point: LngLat | null]
}>()

const { t } = useI18n()
const { formatDistance } = useFormat()
const estimateDuration = useDurationEstimate()

const rows = computed(() => [
  ...props.steps.map((step, i) => ({
    key: String(i),
    number: String(i + 1),
    icon: POI_ICONS[step.type],
    type: t(`pois.${step.type}`),
    name: step.note || t(`pois.${step.type}`),
    distance: formatDistance(step.distanceM),
    duration: formatDuration(estimateDuration(props.sport, step.distanceM, step.gainM)),
    coordinates: step.coordinates as LngLat | null,
    end: false,
  })),
  {
    key: 'end',
    number: null,
    icon: props.isLoop ? 'i-lucide-rotate-ccw' : 'i-lucide-flag',
    type: null,
    name: props.isLoop ? t('route.steps.loopEnd') : t('route.steps.end'),
    distance: formatDistance(props.distanceM),
    duration: formatDuration(estimateDuration(props.sport, props.distanceM, props.elevationGainM)),
    coordinates: null,
    end: true,
  },
])
</script>

<template>
  <section class="space-y-2.5" aria-labelledby="steps-title">
    <h2 id="steps-title" class="text-[1.375rem] leading-tight font-bold">{{ t('route.steps.title') }}</h2>
    <div class="relative ps-3.5">
      <span class="absolute -inset-y-1.5 start-0 w-2 rounded-xs bg-(--post)" aria-hidden="true" />
      <ol class="space-y-2">
        <li
          v-for="row in rows"
          :key="row.key"
          class="step-sign bg-(--step-edge)"
          :class="{ end: row.end }"
          data-testid="route-step"
          @mouseenter="row.coordinates && emit('hover', row.coordinates)"
          @mouseleave="row.coordinates && emit('hover', null)"
        >
          <div class="flex items-center gap-2.5" :class="row.end ? 'bg-(--sign) text-(--sign-text)' : 'bg-default text-highlighted'">
            <span
              class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[2px] px-1 text-xs font-bold"
              :class="row.end ? 'bg-(--sign-text) text-(--sign)' : 'bg-inverted text-inverted'"
              aria-hidden="true"
            >
              <template v-if="row.number">{{ row.number }}</template>
              <UIcon v-else :name="row.icon" class="size-3.5" />
            </span>
            <span class="min-w-0 flex-1 py-1 leading-tight">
              <span v-if="row.number" class="sr-only">{{ t('route.steps.number', { number: row.number }) }} · </span>
              <span class="line-clamp-2 font-semibold break-words">{{ row.name }}</span>
              <span v-if="row.type && row.name !== row.type" class="flex items-center gap-1 text-xs text-muted">
                <UIcon :name="row.icon" class="size-3 shrink-0" aria-hidden="true" />{{ row.type }}
              </span>
            </span>
            <span class="shrink-0 font-numbers text-sm font-medium tabular-nums" :class="row.end ? '' : 'text-muted'">{{ row.distance }}</span>
            <span class="w-13 shrink-0 text-end font-numbers text-lg font-bold tabular-nums">
              <span class="sr-only">{{ t('route.steps.at') }}</span>{{ row.duration }}
            </span>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
/* A direction sign: the outline is the outer shape showing 1.5px around the inner one, as DurationSign. */
.step-sign {
  --tip: 18px;
  padding: 1.5px;
  clip-path: polygon(0 0, calc(100% - var(--tip)) 0, 100% 50%, calc(100% - var(--tip)) 100%, 0 100%);
}
.step-sign > div {
  min-height: 2.625rem;
  padding: 0 calc(var(--tip) + 0.625rem) 0 0.625rem;
  clip-path: polygon(0 0, calc(100% - var(--tip) + 1px) 0, 100% 50%, calc(100% - var(--tip) + 1px) 100%, 0 100%);
}
</style>
