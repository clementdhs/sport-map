<script setup lang="ts">
import type { MyProfile, RecordOuting } from '#shared/types/routes'
import { OVERLOAD_ABOVE, RECOVERY_BELOW, type FormWindow } from '#shared/utils/trainingForm'
import type { KeyFigure } from '~/utils/keyFigures'

// "Ta forme du moment" in detail (#263, mockup 2): the last 7 days against the baseline, the ratio on the yellow
// sign, the chart of the last 8 weeks, what the coach does in each state and the outings of the last 7 days.
// Computed in the browser from the profile's outings, like the statistics: no request of its own.
const { t } = useI18n()
const { formatDistance, formatNumber, formatShortDate } = useFormat()
useSeoMeta({ title: () => `${t('coachForm.title')} — sportmap` })

const { data, error } = await useFetch<MyProfile>('/api/profile/me')
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}
const outings = computed<RecordOuting[]>(() => data.value?.outings ?? [])
const form = computed(() => trainingForm(outings.value))
const weeks = computed(() => formWeeks(outings.value))
const sentence = useFormSentence(form)

const round = (value: number) => formatNumber(Math.round(value))
const ratioLabel = computed(() => formatNumber(form.value.ratio ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const threshold = (value: number) => formatNumber(value, { minimumFractionDigits: 1 })

const figures = computed<KeyFigure[]>(() => {
  const baselineHint = form.value.baselineDays >= 28
    ? t('coachForm.baselineWeeks')
    : t('coachForm.baselineDays', { count: form.value.baselineDays })
  return [
    {
      label: t('coachForm.recent'),
      value: round(form.value.load),
      unit: t('coachForm.unit'),
      hint: t('coachForm.recentHint', { distance: formatDistance(form.value.distanceM), gain: round(form.value.gainM) }),
    },
    { label: t('coachForm.baseline'), value: round(form.value.baseline ?? 0), unit: t('coachForm.perWeek'), hint: baselineHint },
  ]
})

// Chart: clean axis, 0 and 3 to 5 round steps above the tallest bar or baseline.
const axis = computed(() => {
  const max = Math.max(...weeks.value.flatMap(w => [w.load, w.baseline ?? 0]), 0)
  if (!max) return { top: 1, ticks: [0] }
  const magnitude = 10 ** Math.floor(Math.log10(max / 4))
  const step = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => max / s <= 4)!
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value * 100) / 100)
  return { top, ticks }
})
const height = (value: number) => `${(value / axis.value.top) * 100}%`
const current = computed(() => weeks.value.length - 1)
const hovered = ref<number | null>(null)
const weekRange = (week: FormWindow) => t('coachForm.chart.range', { start: formatShortDate(week.start), end: formatShortDate(week.end) })
const weekLabel = (week: FormWindow, i: number) => (i === current.value ? t('coachForm.chart.last') : formatShortDate(week.start))

const states = ['recovery', 'progress', 'overload'] as const
// Full class names, for Tailwind to find them.
const STATE_COLORS = { recovery: 'bg-(--form-recovery)', progress: 'bg-(--form-progress)', overload: 'bg-(--form-overload)' }
const stateRule = (state: typeof states[number]) => t(`coachForm.rules.${state}`, {
  low: threshold(RECOVERY_BELOW),
  high: threshold(OVERLOAD_ABOVE),
})
</script>

<template>
  <UContainer v-if="data" class="max-w-2xl space-y-5 py-6 sm:py-8">
    <UButton to="/coach" icon="i-lucide-chevron-left" color="neutral" variant="link" class="-ms-2.5" :label="t('coachForm.back')" />

    <div class="space-y-1.5">
      <h1 class="text-[2.25rem] leading-none font-bold">{{ t('coachForm.title') }}</h1>
      <p class="text-sm text-muted">{{ t('coachForm.subtitle') }}</p>
    </div>

    <CoachFormStart v-if="form.state === 'learning'" :form="form" />

    <template v-else>
      <section
        class="space-y-3 rounded-lg border-2 border-(--mark-edge) bg-default p-4"
        data-testid="coach-form-state"
        :data-state="form.state"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="font-display text-3xl leading-tight font-bold text-highlighted">{{ t(`coachForm.states.${form.state}`) }}</p>
          <span class="ratio-sign inline-block shrink-0 bg-(--sign-edge)">
            <span class="flex items-center bg-(--sign) font-numbers text-lg font-bold whitespace-nowrap text-(--sign-text) tabular-nums">
              <span aria-hidden="true">× {{ ratioLabel }}</span>
              <span class="sr-only">{{ t('coachForm.ratioValue', { ratio: ratioLabel }) }}</span>
            </span>
          </span>
        </div>
        <KeyFigures :figures="figures" />
        <CoachFormGauge :ratio="form.ratio ?? 0" />
        <p class="text-sm">{{ sentence }}</p>
        <p class="text-sm text-toned">{{ t(`coachForm.explain.${form.state}`, { high: threshold(OVERLOAD_ABOVE) }) }}</p>
      </section>

      <section class="space-y-2">
        <h2 class="text-base font-semibold">{{ t('coachForm.chart.title') }}</h2>
        <!-- One bar per 7 days in the tracks' rust, the last 7 days in ink, the baseline each was judged against as a
             dashed line. Values stay available in the table below it. -->
        <figure class="space-y-1" aria-hidden="true">
          <figcaption class="text-right text-xs text-muted">{{ t('coachForm.unit') }}</figcaption>
          <div class="relative mt-5 h-40 pl-8" @mouseleave="hovered = null">
            <div
              v-for="tick in axis.ticks"
              :key="tick"
              class="absolute inset-x-0 border-t border-dashed border-accented"
              :style="{ bottom: height(tick) }"
            >
              <span class="absolute -top-2 left-0 w-6 text-right font-numbers text-[11px] text-muted tabular-nums">{{ formatNumber(tick) }}</span>
            </div>
            <div class="relative flex h-full items-end gap-1">
              <div
                v-for="(week, i) in weeks"
                :key="week.end"
                class="relative flex h-full flex-1 cursor-default items-end justify-center"
                data-testid="form-week"
                @mouseenter="hovered = i"
              >
                <div
                  class="relative w-full max-w-9 rounded-t-[4px] transition-opacity"
                  :class="[i === current ? 'bg-(--chart-current)' : 'bg-(--chart-bar)', { 'opacity-60': hovered !== null && hovered !== i }]"
                  :style="{ height: height(week.load) }"
                >
                  <span
                    v-if="i === current && hovered === null"
                    class="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 font-numbers text-xs font-semibold text-highlighted tabular-nums"
                  >{{ round(week.load) }}</span>
                </div>
                <!-- Ringed with the surface, so it still shows across the ink bar of the last 7 days. -->
                <div
                  v-if="week.baseline !== null"
                  class="absolute -inset-x-0.5 border-t-2 border-dashed border-(--ui-text-highlighted) ring-[1.5px] ring-(--ui-bg)"
                  :style="{ bottom: height(week.baseline) }"
                />
                <div
                  v-if="hovered === i"
                  class="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-48 rounded-md border border-default bg-default px-2 py-1 text-xs shadow-md"
                  :class="i < weeks.length / 2 ? 'left-0' : 'right-0'"
                >
                  <p class="font-medium">{{ weekRange(week) }}</p>
                  <p class="text-muted">
                    {{ t('coachForm.outingLoad', { load: round(week.load) }) }}
                    <template v-if="week.baseline !== null"> · {{ t('coachForm.chart.baselineValue', { load: round(week.baseline) }) }}</template>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div class="flex h-4 gap-1 pl-8">
            <span
              v-for="(week, i) in weeks"
              :key="week.end"
              class="relative flex-1 text-[11px]"
              :class="[i === current ? 'font-semibold text-highlighted' : 'text-muted', { 'invisible sm:visible': i % 2 === 1 && i !== current }]"
            >
              <span class="absolute top-0 left-1/2 -translate-x-1/2 whitespace-nowrap">{{ weekLabel(week, i) }}</span>
            </span>
          </div>
        </figure>
        <div class="flex flex-wrap gap-4 text-xs text-toned" aria-hidden="true">
          <span class="flex items-center gap-1.5"><span class="size-3 rounded-[2px] bg-(--chart-bar)" />{{ t('coachForm.chart.week') }}</span>
          <span class="flex items-center gap-1.5"><span class="w-4.5 border-t-2 border-dashed border-(--ui-text-highlighted)" />{{ t('coachForm.chart.baseline') }}</span>
        </div>
        <p class="text-xs text-muted">{{ t('coachForm.chart.unitHint') }}</p>
        <!-- In a box: an sr-only table keeps its width and widens the page. -->
        <div class="sr-only">
          <table>
            <caption>{{ t('coachForm.chart.caption') }}</caption>
            <thead>
              <tr><th>{{ t('coachForm.chart.period') }}</th><th>{{ t('coachForm.chart.load') }}</th><th>{{ t('coachForm.baseline') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="week in weeks" :key="week.end">
                <td>{{ weekRange(week) }}</td>
                <td>{{ round(week.load) }}</td>
                <td>{{ week.baseline === null ? '—' : round(week.baseline) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-base font-semibold">{{ t('coachForm.rules.title') }}</h2>
        <ul class="space-y-2">
          <li v-for="state in states" :key="state" class="flex items-start gap-2.5 text-sm">
            <span
              class="mt-0.5 h-8 w-2.5 shrink-0 rounded-[2px]"
              :class="[STATE_COLORS[state], { 'ring-2 ring-(--ui-text-highlighted)': state === form.state }]"
            />
            <span>
              <strong>{{ t(`coachForm.zones.${state}`) }}</strong>
              <span v-if="state === form.state" class="sr-only"> ({{ t('coachForm.rules.current') }})</span>
              {{ stateRule(state) }}
            </span>
          </li>
        </ul>
      </section>
    </template>

    <section class="space-y-1.5">
      <h2 class="text-base font-semibold">{{ t('coachForm.recent') }}</h2>
      <p v-if="!form.recent.length" class="text-sm text-muted">{{ t('coachForm.noRecent') }}</p>
      <ul v-else class="divide-y divide-default border-y border-default" data-testid="coach-form-outings">
        <li v-for="{ outing, load, date } in form.recent" :key="`${outing.route_id}-${outing.completed_at}`" class="flex items-baseline justify-between gap-3 py-2.5 text-sm">
          <span class="min-w-0">
            <strong>{{ formatShortDate(date) }}</strong> ·
            <NuxtLink :to="`/routes/${outing.route_id}`" class="hover:underline">{{ outing.route_name }}</NuxtLink> ·
            <span class="text-toned">{{ formatDistance(outing.distance_m) }}, {{ t('stats.gainValue', { gain: `${round(outing.elevation_gain_m ?? 0)} m` }) }}</span>
          </span>
          <span class="shrink-0 font-numbers text-lg font-semibold tabular-nums">
            {{ round(load) }}<span class="sr-only"> {{ t('coachForm.unit') }}</span>
          </span>
        </li>
      </ul>
      <p class="text-xs text-muted">{{ t('coachForm.cycling') }}</p>
    </section>
  </UContainer>
</template>

<style scoped>
/* The yellow arrow sign of DurationSign: the ink outline is the outer shape showing 1.5px around the inner one. */
.ratio-sign {
  --tip: 14px;
  padding: 1.5px;
  clip-path: polygon(0 0, calc(100% - var(--tip)) 0, 100% 50%, calc(100% - var(--tip)) 100%, 0 100%);
}
.ratio-sign > span {
  height: 2.125rem;
  padding: 0 calc(var(--tip) + 0.5rem) 0 0.625rem;
  clip-path: polygon(0 0, calc(100% - var(--tip) + 1px) 0, 100% 50%, calc(100% - var(--tip) + 1px) 100%, 0 100%);
}
</style>
