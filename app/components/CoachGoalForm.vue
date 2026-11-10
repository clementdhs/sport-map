<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CoachGoal } from '#shared/types/account'
import { COACH_GOAL_KINDS, coachGoalSchema, RACE_DISTANCE_KM, RACE_GAIN_M, type CoachGoalKind, type CoachGoalPayload } from '#shared/utils/coachGoal'

// The coach's goal (#264, mockup 5): ease back in, progress or a race, with its date, distance and gain. In the
// goal dialog of the coach page, and on the page itself while the coach is learning.
const props = defineProps<{
  goal: CoachGoal | null
}>()
const emit = defineEmits<{
  saved: [goal: CoachGoal]
}>()

const { t } = useI18n()
const toast = useToast()
const errorMessage = useErrorMessage()
const schema = useLocalizedSchema(coachGoalSchema)

type State = {
  kind: CoachGoalKind
  race_date: string | undefined
  race_distance_m: number | undefined
  race_gain_m: number | null
}
const fromGoal = (goal: CoachGoal | null): State => ({
  kind: (goal?.kind ?? 'progress') as CoachGoalKind,
  race_date: goal?.race_date ?? undefined,
  race_distance_m: goal?.race_distance_m ?? undefined,
  race_gain_m: goal?.race_gain_m ?? null,
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

// The earliest date offered: today in France.
const today = localDate(new Date())
const unchanged = computed(() => {
  const saved = fromGoal(props.goal)
  if (!props.goal || saved.kind !== state.kind) return false
  return state.kind !== 'race' || (saved.race_date === state.race_date
    && saved.race_distance_m === state.race_distance_m && saved.race_gain_m === state.race_gain_m)
})

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
        :class="state.kind === kind
          ? 'border-(--ui-text-highlighted) bg-inverted text-inverted'
          : 'border-accented bg-default text-highlighted hover:bg-elevated/50'"
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
    <UButton type="submit" :label="t('coachGoal.save')" :loading="saving" :disabled="unchanged" data-testid="coach-goal-save" />
  </UForm>
</template>
