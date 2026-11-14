<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CoachGoal } from '#shared/types/account'
import {
  COACH_GOAL_KINDS,
  coachGoalSchema,
  DEFAULT_OUTINGS_PER_WEEK,
  OUTINGS_PER_WEEK,
  RACE_DISTANCE_KM,
  RACE_GAIN_M,
  weekdayName,
  WEEKDAYS,
  type CoachGoalKind,
  type CoachGoalPayload,
} from '#shared/utils/coachGoal'

// The coach's goal (#264, mockup 5): ease back in, progress or a race, with its date, distance and gain, and the
// member's week (#283): outings a week, optionally their days and the long run's. In the goal dialog of the coach
// page, and on the page itself while the coach is learning.
const props = defineProps<{
  goal: CoachGoal | null
}>()
const emit = defineEmits<{
  saved: [goal: CoachGoal]
}>()

const { t } = useI18n()
const { locale } = useFormat()
const toast = useToast()
const errorMessage = useErrorMessage()
const schema = useLocalizedSchema(coachGoalSchema)

type State = {
  kind: CoachGoalKind
  race_date: string | undefined
  race_distance_m: number | undefined
  race_gain_m: number | null
  outings_per_week: number
  preferred_days: number[]
  long_run_day: number | null
}
const fromGoal = (goal: CoachGoal | null): State => ({
  kind: (goal?.kind ?? 'progress') as CoachGoalKind,
  race_date: goal?.race_date ?? undefined,
  race_distance_m: goal?.race_distance_m ?? undefined,
  race_gain_m: goal?.race_gain_m ?? null,
  outings_per_week: goal?.outings_per_week ?? DEFAULT_OUTINGS_PER_WEEK,
  preferred_days: [...(goal?.preferred_days ?? [])],
  long_run_day: goal?.long_run_day ?? null,
})
const state = reactive<State>(fromGoal(props.goal))
watch(() => props.goal, goal => Object.assign(state, fromGoal(goal)))

// Typed in km, kept in metres like the table.
const distanceKm = computed({
  get: () => state.race_distance_m === undefined ? undefined : state.race_distance_m / 1000,
  set: (km: number | null | undefined) => { state.race_distance_m = km === null || km === undefined ? undefined : Math.round(km * 1000) },
})
const gain = computed({
  get: () => state.race_gain_m ?? undefined,
  set: (value: number | null | undefined) => { state.race_gain_m = value ?? null },
})

// The member's week (#283)
const COUNTS = Array.from({ length: OUTINGS_PER_WEEK.max - OUTINGS_PER_WEEK.min + 1 }, (_, i) => OUTINGS_PER_WEEK.min + i)
function toggleDay(day: number) {
  state.preferred_days = state.preferred_days.includes(day)
    ? state.preferred_days.filter(d => d !== day)
    : [...state.preferred_days, day].sort((a, b) => a - b)
}
// The long run on one of the chosen days, any day without them
const longRunDays = computed(() => (state.preferred_days.length ? state.preferred_days : [...WEEKDAYS]))
watch(longRunDays, (days) => {
  if (state.long_run_day !== null && !days.includes(state.long_run_day)) state.long_run_day = null
})

// The earliest date offered: today in France.
const today = localDate(new Date())
const unchanged = computed(() => {
  const saved = fromGoal(props.goal)
  if (!props.goal || saved.kind !== state.kind) return false
  if (saved.outings_per_week !== state.outings_per_week || saved.long_run_day !== state.long_run_day
    || saved.preferred_days.join() !== state.preferred_days.join()) return false
  return state.kind !== 'race' || (saved.race_date === state.race_date
    && saved.race_distance_m === state.race_distance_m && saved.race_gain_m === state.race_gain_m)
})

const pill = (on: boolean) => on
  ? 'border-(--ui-text-highlighted) bg-inverted text-inverted'
  : 'border-accented bg-default text-highlighted hover:bg-elevated/50'

const saving = ref(false)
async function save(event: FormSubmitEvent<CoachGoalPayload>) {
  saving.value = true
  try {
    const goal = await $fetch<CoachGoal>('/api/profile/me/coach-goal', { method: 'PUT', body: event.data })
    toast.add({ title: t('coachGoal.saved'), color: 'success', icon: 'i-lucide-check' })
    emit('saved', goal)
  }
  catch (error) {
    toast.add({ title: errorMessage(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-3" data-testid="coach-goal-form" @submit="save">
    <div class="flex flex-col gap-1.5" role="group" :aria-label="t('coachGoal.title')">
      <button
        v-for="kind in COACH_GOAL_KINDS"
        :key="kind"
        type="button"
        class="min-h-13 rounded-lg border-[1.5px] px-3 py-2.5 text-left transition-colors"
        :class="pill(state.kind === kind)"
        :aria-pressed="state.kind === kind"
        :data-kind="kind"
        @click="state.kind = kind"
      >
        <span class="block font-bold">{{ t(`coachGoal.kinds.${kind}`) }}</span>
        <span class="mt-0.5 block text-sm opacity-85">{{ t(`coachGoal.hints.${kind}`) }}</span>
      </button>
    </div>
    <div v-if="state.kind === 'race'" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UFormField name="race_date" :label="t('coachGoal.date')" required>
        <UInput v-model="state.race_date" type="date" :min="today" class="w-full" data-testid="coach-goal-date" />
      </UFormField>
      <UFormField name="race_distance_m" :label="t('coachGoal.distance')" required>
        <UInputNumber
          v-model="distanceKm"
          :min="RACE_DISTANCE_KM.min"
          :max="RACE_DISTANCE_KM.max"
          :step="0.1"
          :step-snapping="false"
          :format-options="{ maximumFractionDigits: 1 }"
          class="w-full"
          data-testid="coach-goal-distance"
        />
      </UFormField>
      <UFormField name="race_gain_m" :label="t('coachGoal.gain')" :hint="t('coachGoal.gainHint')">
        <UInputNumber
          v-model="gain"
          :min="RACE_GAIN_M.min"
          :max="RACE_GAIN_M.max"
          :step="10"
          :step-snapping="false"
          class="w-full"
          data-testid="coach-goal-gain"
        />
      </UFormField>
    </div>
    <UFormField name="outings_per_week" :label="t('coachGoal.outingsPerWeek')">
      <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('coachGoal.outingsPerWeek')" data-testid="coach-goal-outings">
        <button
          v-for="count in COUNTS"
          :key="count"
          type="button"
          class="min-h-11 min-w-11 rounded-full border-[1.5px] px-3.5 font-semibold transition-colors"
          :class="pill(state.outings_per_week === count)"
          :aria-pressed="state.outings_per_week === count"
          @click="state.outings_per_week = count"
        >
          {{ count }}
        </button>
      </div>
    </UFormField>
    <UFormField name="preferred_days" :label="t('coachGoal.days')" :hint="t('coachGoal.daysHint')">
      <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('coachGoal.days')" data-testid="coach-goal-days">
        <button
          v-for="day in WEEKDAYS"
          :key="day"
          type="button"
          class="min-h-11 rounded-full border-[1.5px] px-3 font-semibold transition-colors"
          :class="pill(state.preferred_days.includes(day))"
          :aria-pressed="state.preferred_days.includes(day)"
          :data-day="day"
          @click="toggleDay(day)"
        >
          {{ weekdayName(day, locale()) }}
        </button>
      </div>
    </UFormField>
    <UFormField name="long_run_day" :label="t('coachGoal.longRunDay')" :hint="t('coachGoal.longRunDayHint')">
      <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('coachGoal.longRunDay')" data-testid="coach-goal-long-run">
        <button
          type="button"
          class="min-h-11 rounded-full border-[1.5px] px-3 font-semibold transition-colors"
          :class="pill(state.long_run_day === null)"
          :aria-pressed="state.long_run_day === null"
          @click="state.long_run_day = null"
        >
          {{ t('coachGoal.noLongRunDay') }}
        </button>
        <button
          v-for="day in longRunDays"
          :key="day"
          type="button"
          class="min-h-11 rounded-full border-[1.5px] px-3 font-semibold transition-colors"
          :class="pill(state.long_run_day === day)"
          :aria-pressed="state.long_run_day === day"
          :data-day="day"
          @click="state.long_run_day = day"
        >
          {{ weekdayName(day, locale()) }}
        </button>
      </div>
    </UFormField>
    <UButton type="submit" :label="t('coachGoal.save')" :loading="saving" :disabled="unchanged" data-testid="coach-goal-save" />
  </UForm>
</template>
