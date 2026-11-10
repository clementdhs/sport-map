<script setup lang="ts">
import type { StatsOuting } from '#shared/types/routes'
import type { SportType } from '#shared/utils/routes'
import { GOAL_DEFAULTS, GOAL_MAX, GOAL_METRICS, GOAL_TRAIL_END, GOAL_TRAIL_HEIGHT, GOAL_TRAIL_WIDTH, type GoalMetric, type YearGoal } from '~/utils/yearGoal'

// The member's goal for the year (#141), on their own profile under the year's summary: a gauge with the steady
// pace marked, how far ahead or behind it they are, and what is left each week. Private: kept with the
// preferences of their account, never sent to other members.
const props = defineProps<{
  outings: StatsOuting[]
}>()

const { t } = useI18n()
const { formatNumber } = useFormat()
const goal = usePreference('yearGoal')
const sports = useSportItems()

const progress = computed(() => (goal.value ? goalProgress(goal.value, props.outings) : null))
const year = computed(() => Number(localDate(new Date()).slice(0, 4)))
const titleId = useId()

function formatGoal(value: number, metric: GoalMetric): string {
  if (metric === 'outings') return t('profile.goal.outingCount', Math.round(value))
  if (metric === 'gain') return `${formatNumber(Math.round(value))} m`
  return `${formatNumber(value, { maximumFractionDigits: value < 100 ? 1 : 0 })} km`
}

// What is left each week, rounded up so it never reads as nothing while the goal isn't reached.
function formatPerWeek(value: number, metric: GoalMetric): string {
  if (metric === 'outings') return formatGoal(Math.ceil(value), metric)
  return formatGoal(metric === 'distance' && value < 100 ? Math.ceil(value * 10) / 10 : Math.ceil(value), metric)
}

const sportLabel = computed(() => sports.value.find(item => item.value === goal.value?.sport)?.label)
const fraction = (value: number) => Math.min(value / (progress.value?.target || 1), 1)

// The trail (#236): done in solid rust up to the member's dot, the rest dashed up to the finish signpost.
const trail = computed(() => {
  const p = progress.value
  if (!p) return null
  const done = fraction(p.done)
  const x = goalTrailX(done)
  const paceX = goalTrailX(fraction(p.expected))
  return {
    done: goalTrailPath(0, done),
    rest: goalTrailPath(done, 1),
    at: [x, goalTrailY(x)],
    pace: p.reached ? null : [paceX, goalTrailY(paceX)],
  }
})
const endY = goalTrailY(GOAL_TRAIL_END)
const target = computed(() => (progress.value ? formatNumber(Math.round(progress.value.target)) : ''))
const percentDone = computed(() => (progress.value ? Math.floor(fraction(progress.value.done) * 100) : 0))

// Ahead or behind the steady pace, in the goal's unit, rounded as shown.
const pace = computed(() => {
  const p = progress.value
  if (!p || !goal.value || p.reached) return null
  const metric = goal.value.metric
  const gap = Math.abs(p.gap)
  const shown = metric === 'distance' ? (gap < 100 ? Math.round(gap * 10) / 10 : Math.round(gap)) : Math.round(gap)
  if (!shown) return t('profile.goal.onPace')
  return t(p.gap > 0 ? 'profile.goal.ahead' : 'profile.goal.behind', { gap: formatGoal(gap, metric) })
})

// Dialog: the goal being chosen.
const open = ref(false)
const draft = reactive<{ metric: GoalMetric, target: number | null, sport: SportType | 'all' }>({ metric: 'distance', target: GOAL_DEFAULTS.distance, sport: 'all' })
const metricItems = computed(() => GOAL_METRICS.map(value => ({ value, label: t(`profile.goal.metrics.${value}`) })))
const sportItems = computed(() => [{ value: 'all', label: t('filters.allSports'), icon: 'i-lucide-list' }, ...sports.value])
const unit = computed(() => t(`profile.goal.units.${draft.metric}`))
const valid = computed(() => !!draft.target && draft.target > 0 && draft.target <= GOAL_MAX[draft.metric])

function edit() {
  Object.assign(draft, goal.value
    ? { ...goal.value, sport: goal.value.sport ?? 'all' }
    : { metric: 'distance', target: GOAL_DEFAULTS.distance, sport: 'all' })
  open.value = true
}

function pickMetric(metric: GoalMetric) {
  if (metric === draft.metric) return
  draft.metric = metric
  draft.target = GOAL_DEFAULTS[metric]
}

function save() {
  if (!valid.value) return
  const chosen: YearGoal = { metric: draft.metric, target: draft.target!, sport: draft.sport === 'all' ? null : draft.sport }
  goal.value = parseYearGoal(chosen)
  open.value = false
}

function remove() {
  goal.value = null
  open.value = false
}
</script>

<template>
  <section :aria-labelledby="goal ? titleId : undefined" data-testid="year-goal">
    <div v-if="goal && progress && trail">
      <div class="flex items-baseline gap-2">
        <h2 :id="titleId" class="min-w-0 flex-1 font-display text-2xl font-bold">
          {{ t('profile.goal.title', { year: progress.year }) }}<template v-if="sportLabel"> · {{ sportLabel }}</template>
          <UIcon name="i-lucide-lock" class="ml-1 size-4 align-baseline text-muted" :aria-label="t('profile.goal.private')" />
        </h2>
        <UButton :label="t('common.edit')" :aria-label="t('profile.goal.edit')" variant="link" class="px-0 font-semibold" @click="edit" />
      </div>
      <!-- The trail: what is done, the dot where the member stands, the tick of the steady pace to finish on
           31 December, and the finish sign with the target. -->
      <div
        role="progressbar"
        class="mt-1"
        aria-valuemin="0"
        :aria-valuemax="progress.target"
        :aria-valuenow="Math.min(progress.done, progress.target)"
        :aria-valuetext="t('profile.goal.progress', { done: formatGoal(progress.done, goal.metric), target: formatGoal(progress.target, goal.metric) })"
        :aria-labelledby="titleId"
      >
        <svg :viewBox="`0 0 ${GOAL_TRAIL_WIDTH} ${GOAL_TRAIL_HEIGHT}`" class="block h-auto w-full max-w-md" aria-hidden="true">
          <path v-if="trail.rest" :d="trail.rest" fill="none" class="stroke-(--chart-bar)" stroke-width="3" stroke-dasharray="3 6" stroke-linecap="round" />
          <path v-if="trail.done" :d="trail.done" fill="none" class="stroke-(--chart-bar)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
          <line
            v-if="trail.pace"
            :x1="trail.pace[0]"
            :x2="trail.pace[0]"
            :y1="trail.pace[1]! - 9"
            :y2="trail.pace[1]! + 9"
            class="stroke-(--chart-current)"
            stroke-width="2"
            stroke-linecap="round"
          >
            <title>{{ t('profile.goal.paceMark') }}</title>
          </line>
          <path :d="`M${GOAL_TRAIL_END} ${endY} V8`" class="stroke-(--chart-current)" stroke-width="2" />
          <path :d="`M${GOAL_TRAIL_END + 32} 6 h-48 l-7 8 l7 8 h48 z`" class="fill-(--sign) stroke-(--sign-edge)" stroke-width="1.5" stroke-linejoin="round" />
          <text :x="GOAL_TRAIL_END + 11" y="18.5" text-anchor="middle" class="fill-(--sign-text) font-numbers text-[11px] font-bold">{{ target }}</text>
          <circle :cx="trail.at[0]" :cy="trail.at[1]" r="7.5" class="fill-(--chart-current) stroke-(--ui-bg)" stroke-width="3" />
        </svg>
      </div>
      <p class="font-numbers tabular-nums">
        <span class="text-2xl font-semibold">{{ formatGoal(progress.done, goal.metric) }}</span>
        <span class="text-muted"> / {{ formatGoal(progress.target, goal.metric) }} · {{ percentDone }} %</span>
      </p>
      <p class="text-sm" data-testid="year-goal-status">
        <template v-if="progress.reached">
          <UIcon name="i-lucide-party-popper" class="mr-1 size-4 align-text-bottom text-primary" />{{ t('profile.goal.reached') }}
        </template>
        <template v-else>
          {{ pace }}<span class="text-muted"> · {{ t('profile.goal.perWeek', { value: formatPerWeek(progress.perWeek, goal.metric) }) }}</span>
        </template>
      </p>
    </div>

    <UButton
      v-else
      icon="i-lucide-target"
      :label="t('profile.goal.set', { year })"
      color="neutral"
      variant="outline"
      size="sm"
      @click="edit"
    />

    <UModal v-model:open="open" :title="t('profile.goal.dialogTitle')" :description="t('profile.goal.dialogDescription')">
      <template #body>
        <form id="year-goal-form" class="space-y-4" @submit.prevent="save">
          <UFormField :label="t('profile.goal.metric')">
            <UTabs
              :model-value="draft.metric"
              :items="metricItems"
              :content="false"
              size="sm"
              :aria-label="t('profile.goal.metric')"
              @update:model-value="pickMetric($event as GoalMetric)"
            />
          </UFormField>
          <UFormField :label="t('profile.goal.sport')">
            <USelect v-model="draft.sport" :items="sportItems" class="w-full" :aria-label="t('profile.goal.sport')" />
          </UFormField>
          <UFormField :label="t('profile.goal.target', { unit })">
            <UInputNumber
              v-model="draft.target"
              :min="1"
              :max="GOAL_MAX[draft.metric]"
              :step="draft.metric === 'outings' ? 1 : draft.metric === 'distance' ? 50 : 1000"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center gap-2">
          <UButton v-if="goal" :label="t('profile.goal.remove')" icon="i-lucide-trash-2" color="error" variant="ghost" @click="remove" />
          <span class="flex-1" />
          <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="open = false" />
          <UButton type="submit" form="year-goal-form" :label="t('common.save')" :disabled="!valid" />
        </div>
      </template>
    </UModal>
  </section>
</template>
