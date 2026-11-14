<script setup lang="ts">
import type { PlanDay } from '#shared/utils/coachPlan'
import { weekdayName } from '#shared/utils/coachGoal'
import type { SessionKind } from '#shared/utils/coachSessions'

// « Ta semaine » on the coach page (#285, mockup 7): the 7 days of the week in tight columns, each with its date,
// a small glyph of its effort and its duration; done, skipped, rest, today and the chosen day told apart. A click
// picks the day the session card shows, in place of the « Quel jour ? » pills of #279.
const props = defineProps<{
  days: PlanDay[]
  selected: string
}>()
const emit = defineEmits<{
  select: [date: string]
}>()

const { t } = useI18n()
const { locale, formatNumber } = useFormat()

type Bar = 'easy' | 'hilly' | 'key' | 'rest'
const GLYPHS: Record<SessionKind, Bar[]> = {
  rest: ['rest'],
  raceDay: ['key'],
  recovery: ['easy'],
  endurance: ['easy', 'easy'],
  long: ['easy', 'easy', 'easy'],
  longHilly: ['easy', 'hilly', 'easy', 'hilly'],
  shortHills: ['easy', 'key', 'key', 'key', 'easy'],
  longHills: ['easy', 'key', 'key', 'easy'],
  intervals: ['easy', 'key', 'key', 'key', 'easy'],
}
const BAR: Record<Bar, string> = {
  easy: 'h-2.5 w-1.5 bg-(--form-recovery)',
  hilly: 'h-4 w-1.5 bg-(--form-progress)',
  key: 'h-5.5 w-1 bg-(--form-overload)',
  rest: 'h-0.5 w-3 bg-accented',
}

function glyph(day: PlanDay): Bar[] {
  if (day.session) return GLYPHS[day.session.plan.kind]
  return day.state === 'rest' ? ['rest'] : ['easy', 'easy']
}

// The duration under the glyph: the session's, the time run, or the day's state
function short(day: PlanDay): string {
  if (day.state === 'done' && !day.session) {
    return day.movingS ? formatDuration(Math.round(day.movingS / 60)) : `${formatNumber(day.distanceM / 1000, { maximumFractionDigits: 1 })} km`
  }
  if (day.session?.plan.minutes) return formatDuration(day.session.plan.minutes)
  return t(`coachWeek.short.${day.state === 'skipped' ? 'skipped' : 'rest'}`)
}

function label(day: PlanDay): string {
  const date = new Date(`${day.date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', timeZone: 'UTC' })
  const session = day.session ? `${t(`coachSession.kinds.${day.session.plan.kind}`)} ${formatDuration(day.session.plan.minutes)}` : ''
  const parts = [date, day.today ? t('coachWeek.legend.today') : '', session, day.state === 'done' ? t('coachWeek.legend.done') : '',
    day.state === 'skipped' ? t('coachWeek.legend.skipped') : '', day.state === 'rest' ? t('coachWeek.short.rest') : '']
  return parts.filter(Boolean).join(', ')
}

function look(day: PlanDay): string {
  if (day.date === props.selected) return 'border-2 border-(--ui-text-highlighted) bg-inverted text-inverted'
  if (day.today) return 'border-2 border-(--ui-text-highlighted) bg-default text-highlighted'
  if (day.state === 'skipped') return 'border-[1.5px] border-dashed border-(--ui-text-dimmed) text-muted'
  if (day.state === 'rest') return 'border-[1.5px] border-default text-muted'
  return 'border-[1.5px] border-accented bg-default text-highlighted'
}

const range = computed(() => {
  const first = props.days[0]
  const last = props.days.at(-1)
  if (!first || !last) return ''
  const format = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale(), { ...options, timeZone: 'UTC' })
  return t('coachWeek.range', { start: format(first.date, { day: 'numeric' }), end: format(last.date, { day: 'numeric', month: 'short' }) })
})
</script>

<template>
  <section class="space-y-2" aria-labelledby="coach-week-title" data-testid="coach-week-band">
    <div class="flex items-baseline justify-between">
      <h2 id="coach-week-title" class="font-semibold [font-family:var(--font-numbers)]">{{ t('coachWeek.title') }}</h2>
      <span class="text-xs text-muted">{{ range }}</span>
    </div>
    <div class="grid grid-cols-7 gap-1" role="group" :aria-label="t('coachWeek.pick')">
      <button
        v-for="day in days"
        :key="day.date"
        type="button"
        class="relative flex min-h-24 flex-col items-center justify-between gap-0.5 rounded-lg px-0.5 pt-1.5 pb-1.5 transition-colors"
        :class="look(day)"
        :aria-pressed="day.date === selected"
        :aria-label="label(day)"
        :data-day="day.date"
        :data-state="day.state"
        :data-kind="day.session?.plan.kind"
        :data-today="day.today || null"
        :data-past="day.past || null"
        @click="emit('select', day.date)"
      >
        <span class="text-[11px] leading-none">{{ weekdayName(day.weekday, locale()) }}</span>
        <span class="font-numbers text-[17px] leading-none font-bold">{{ Number(day.date.slice(8)) }}</span>
        <span class="flex h-5.5 w-full items-end justify-center gap-0.5" :class="{ 'opacity-50': day.state === 'skipped' }" aria-hidden="true">
          <span v-for="(bar, i) in glyph(day)" :key="i" class="rounded-[2px]" :class="BAR[bar]" />
        </span>
        <span class="text-[11px] leading-tight font-semibold">{{ short(day) }}</span>
        <span
          v-if="day.state === 'done'"
          class="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-inverted ring-2 ring-(--ui-bg)"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-check" class="size-3" />
        </span>
      </button>
    </div>
    <ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" :aria-label="t('coachWeek.legend.label')">
      <li class="flex items-center gap-1">
        <span class="flex size-3.5 items-center justify-center rounded-full bg-primary text-inverted"><UIcon name="i-lucide-check" class="size-2.5" /></span>{{ t('coachWeek.legend.done') }}
      </li>
      <li class="flex items-center gap-1"><span class="size-3.5 rounded-[3px] border-[1.5px] border-dashed border-(--ui-text-dimmed)" />{{ t('coachWeek.legend.skipped') }}</li>
      <li class="flex items-center gap-1"><span class="size-3.5 rounded-[3px] border-2 border-(--ui-text-highlighted)" />{{ t('coachWeek.legend.today') }}</li>
      <li class="flex items-center gap-1"><span class="h-3.5 w-2 rounded-[2px] bg-(--form-overload)" />{{ t('coachWeek.legend.key') }}</li>
    </ul>
    <p class="text-xs text-muted">{{ t('coachWeek.recomputed') }}</p>
  </section>
</template>
