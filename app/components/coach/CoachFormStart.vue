<script setup lang="ts">
import { MIN_HISTORY_DAYS, type FormSummary } from '#shared/utils/trainingForm'

// While the coach is learning (#263, mockup 5): the 21 days it needs, those already covered, the days with an
// outing filled in, today ringed, and its verdict on the last one.
const props = defineProps<{
  form: FormSummary
}>()

const { t } = useI18n()
// At least 1: a long history whose baseline is 0 (outings of no distance) still gets no verdict.
const remaining = computed(() => Math.max(1, MIN_HISTORY_DAYS - props.form.historyDays))
const activeDays = computed(() => props.form.days.filter(Boolean).length)
const cells = computed(() => Array.from({ length: MIN_HISTORY_DAYS }, (_, i) => ({
  past: i < props.form.historyDays,
  outing: props.form.days[i] === true,
  today: i === props.form.historyDays - 1,
})))
</script>

<template>
  <section class="space-y-2.5 rounded-lg border border-default bg-default p-4" data-testid="coach-form-start">
    <h2 class="font-display text-[1.75rem] leading-tight font-bold">{{ t('coachForm.learning.title') }}</h2>
    <p class="text-sm text-toned">
      {{ t('coachForm.learning.text', { count: MIN_HISTORY_DAYS / 7 }) }}
      <strong class="text-highlighted">{{ t('coachForm.learning.remaining', remaining) }}</strong>
    </p>
    <div
      class="grid grid-cols-7 gap-1"
      role="img"
      :aria-label="t('coachForm.learning.days', { days: form.historyDays, total: MIN_HISTORY_DAYS, outings: activeDays })"
      data-testid="coach-form-days"
    >
      <span
        v-for="(cell, i) in cells"
        :key="i"
        class="flex h-[18px] items-center justify-center rounded-[2px]"
        :class="[
          cell.past ? (cell.outing ? 'bg-(--form-progress)' : 'bg-elevated') : 'border-[1.5px] border-dashed border-accented',
          { 'ring-2 ring-(--ui-text-highlighted)': cell.today },
        ]"
        :data-day="cell.past ? (cell.outing ? 'outing' : 'rest') : 'future'"
      >
        <span v-if="i === MIN_HISTORY_DAYS - 1" class="size-2.5 border-[1.5px] border-(--sign-edge) bg-(--sign)" />
      </span>
    </div>
    <div class="flex justify-between gap-2 text-xs text-muted" aria-hidden="true">
      <span>{{ form.historyDays > 1 ? t('coachForm.learning.daysAgo', form.historyDays - 1) : t('coachForm.learning.today') }}</span>
      <span v-if="form.historyDays > 1">{{ t('coachForm.learning.today') }}</span>
      <span>{{ t('coachForm.learning.verdict') }}</span>
    </div>
    <p class="text-sm text-toned">
      {{ t('coachForm.learning.hint') }}
    </p>
    <UButton to="/record" icon="i-lucide-circle-dot" color="neutral" variant="outline" :label="t('coachForm.learning.record')" />
  </section>
</template>
