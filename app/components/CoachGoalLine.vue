<script setup lang="ts">
import type { CoachGoal } from '#shared/types/account'
import { daysUntil, weekdayName } from '#shared/utils/coachGoal'

// The coach's goal at the top of the coach page (#264, mockup 1) and the member's week (#283), with "Modifier"
// opening the goal form.
const props = defineProps<{
  goal: CoachGoal | null
}>()
const emit = defineEmits<{
  saved: [goal: CoachGoal]
}>()

const { t } = useI18n()
const { formatNumber, formatShortDate, locale } = useFormat()
const open = ref(false)

const text = computed(() => {
  const goal = props.goal
  if (!goal) return t('coachGoal.none')
  if (goal.kind !== 'race' || !goal.race_date || !goal.race_distance_m) return t(`coachGoal.kinds.${goal.kind}`)
  const distance = `${formatNumber(goal.race_distance_m / 1000, { maximumFractionDigits: 1 })} km`
  const date = formatShortDate(`${goal.race_date}T12:00:00Z`)
  return goal.race_gain_m
    ? t('coachGoal.raceGain', { distance, gain: `${formatNumber(goal.race_gain_m)} m`, date })
    : t('coachGoal.race', { distance, date })
})

// How far the race is: in days the last two weeks, in weeks before.
const when = computed(() => {
  const goal = props.goal
  if (goal?.kind !== 'race' || !goal.race_date) return null
  const days = daysUntil(goal.race_date, localDate(new Date()))
  if (days < 0) return t('coachGoal.when.past')
  if (days === 0) return t('coachGoal.when.today')
  if (days < 14) return t('coachGoal.when.days', days)
  return t('coachGoal.when.weeks', { n: Math.round(days / 7) })
})

// « 3 sorties / sem. : mar., jeu., dim. »
const week = computed(() => {
  const goal = props.goal
  if (!goal) return null
  const week = t('coachGoal.week', { n: goal.outings_per_week }, goal.outings_per_week)
  if (!goal.preferred_days.length) return week
  return t('coachGoal.weekDays', { week, days: goal.preferred_days.map(day => weekdayName(day, locale())).join(', ') })
})

function saved(goal: CoachGoal) {
  open.value = false
  emit('saved', goal)
}
</script>

<template>
  <div class="flex items-center justify-between gap-2 text-sm" data-testid="coach-goal">
    <p class="flex min-w-0 items-center gap-2">
      <UIcon name="i-lucide-flag" class="size-4.5 shrink-0" />
      <span>
        {{ t('coachGoal.label') }} <strong data-testid="coach-goal-text">{{ text }}</strong><template v-if="when"> · {{ when }}</template><template v-if="week"> · <span data-testid="coach-goal-week">{{ week }}</span></template>
      </span>
    </p>
    <UModal v-model:open="open" :title="t('coachGoal.title')">
      <UButton :label="goal ? t('coachGoal.edit') : t('coachGoal.choose')" variant="link" class="shrink-0 font-semibold" data-testid="coach-goal-edit" />
      <template #body>
        <CoachGoalForm :goal="goal" @saved="saved" />
      </template>
    </UModal>
  </div>
</template>
