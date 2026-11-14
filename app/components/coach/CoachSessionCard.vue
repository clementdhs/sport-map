<script setup lang="ts">
import type { CoachGoal } from '#shared/types/account'
import { coachPace, type PaceOuting } from '#shared/utils/coachPace'
import { weekVolume } from '#shared/utils/coachWeek'
import { defaultMinutes, weekPlan } from '#shared/utils/coachPlan'
import {
  coachDays,
  dayNoon,
  SESSION_DURATIONS,
  sessionOn,
  type BlockKind,
  type SessionDuration,
} from '#shared/utils/coachSessions'
import type { LoadOuting } from '#shared/utils/trainingForm'
import type { CoachChoice } from '~/utils/coachChoice'

// "Séance du jour" on the coach page (#264, mockup 1): the session the rules pick from the form, the goal and the
// time available, its blocks, distance, gain and easy pace, the duration picker and "Autre séance". The choices
// are kept in this browser for each day (coachChoice.ts): the same inputs give the same session all day.
// Since #285 (mockup 7) the day is picked on « Ta semaine », the week plan: a past day shows what was done or
// skipped, a rest day says so and can still show a session, an outing day its planned session.
const props = defineProps<{
  outings: (LoadOuting & PaceOuting)[]
  goal: CoachGoal | null
}>()

const { t } = useI18n()
const { formatNumber, locale } = useFormat()
const paces = usePreference('paces')

const today = localDate(new Date())
// The days the weather slot covers (#279): today and the next ones of the forecast
const forecastDays = coachDays()
// The day shown, today until the member picks another on the week
const day = ref(today)
// The durations and « Autre séance » clicks chosen for the days of the week, kept in this browser (#267, #279):
// read once mounted, so the server's render (today, the default duration) hydrates as is.
const choices = ref<Record<string, CoachChoice>>({})
// A rest day's session, shown when the member asks for it anyway
const anyway = ref(false)

// Runs are planned at the member's running pace (#146), else one from their latest runs, else the default (#281).
const easyPace = computed(() => coachPace(props.outings, paces.value.running))
// The week (#285): what was done on the past days and the session planned on each outing day left
const days = computed(() => weekPlan(props.outings, {
  goal: props.goal,
  easyPace: easyPace.value.pace,
  choiceOf: date => choices.value[date] ?? null,
}, today))
const shown = computed(() => days.value.find(d => d.date === day.value) ?? days.value.find(d => d.today)!)

const minutes = computed(() => choices.value[day.value]?.minutes ?? defaultMinutes(props.goal, day.value))
const other = computed(() => choices.value[day.value]?.other ?? 0)
// Kept in this browser for the day: shown again on the next visit, and the review after that day's outing and the
// route of the session look for this same session. A new duration starts « Autre séance » over.
function choose(choice: CoachChoice) {
  choices.value = { ...choices.value, [day.value]: choice }
  saveCoachChoice(choice, day.value)
}
function pickMinutes(value: SessionDuration) {
  choose({ minutes: value, other: 0 })
}
function nextSession() {
  choose({ minutes: minutes.value, other: other.value + 1 })
}

onMounted(() => {
  const kept: Record<string, CoachChoice> = {}
  for (const { date } of days.value) {
    const saved = date >= today ? savedCoachChoice(date) : null
    if (saved) kept[date] = saved
  }
  choices.value = kept
  day.value = loadCoachDay()
})

function select(date: string) {
  day.value = date
  anyway.value = false
  // Only days to come are kept for the route of the session.
  if (date >= today) saveCoachDay(date)
}

const isToday = computed(() => day.value === today)
const date = computed(() => dayNoon(day.value).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }))

// The session shown: the one planned that day, or on a rest day to come the session of the day if asked for.
const choice = computed(() => {
  if (shown.value.session) return shown.value.session
  if (shown.value.past || !anyway.value) return null
  return sessionOn(props.outings, { goal: props.goal, minutes: minutes.value, easyPace: easyPace.value.pace }, day.value, other.value)
})
const plan = computed(() => choice.value?.plan ?? { kind: 'rest' as const, minutes: 0, blocks: [], reps: null, distanceM: 0, gainM: 0, easyPace: easyPace.value.pace })
const forecast = computed(() => forecastDays.includes(day.value))

// What a day without a session shows: what was done, skipped, or a rest day
const dayTitle = computed(() => t(`coachWeek.titles.${shown.value.state === 'planned' ? 'rest' : shown.value.state}`))
const dayText = computed(() => {
  const d = shown.value
  if (d.state === 'done') {
    const distance = `${formatNumber(d.distanceM / 1000, { maximumFractionDigits: 1 })} km`
    return d.movingS
      ? t('coachWeek.doneText', { distance, duration: formatDuration(Math.round(d.movingS / 60)) })
      : t('coachWeek.doneDistance', { distance })
  }
  if (d.state === 'skipped') return t('coachWeek.skippedText')
  return t(props.goal?.preferred_days.length ? 'coachWeek.restText' : 'coachWeek.restSpread')
})

const reason = computed(() => {
  if (!choice.value) return ''
  const { reason, raceDays } = choice.value
  return t(`coachSession.reasons.${reason}`, { n: raceDays ?? 0 }, raceDays ?? 1)
})
// Shortened to what the member's recent outings allow (#281)
const capText = computed(() => {
  if (!choice.value) return ''
  const { cap, capBy } = choice.value
  if (cap === null) return ''
  return capBy === 'week'
    ? t('coachSession.cappedWeek')
    : t('coachSession.capped', { load: formatNumber(cap, { maximumFractionDigits: 0 }) })
})

// The volume of the chosen day's week (#284): done so far against the target, a lighter week now and then.
const week = computed(() => weekVolume(props.outings, props.goal, day.value))
const km = (value: number) => formatNumber(value, { maximumFractionDigits: 0 })
const weekText = computed(() => week.value && t('coachWeek.line', { done: km(week.value.done), target: km(week.value.target) }))
const weekShare = computed(() => week.value && week.value.target > 0 ? Math.min(100, (week.value.done / week.value.target) * 100) : 0)

// The bars of the outline: their width is their time, their height and colour the effort (the form's colours:
// easy blue, rolling green, effort orange).
const BAR: Record<BlockKind, string> = {
  warmup: 'h-3.5 bg-(--form-recovery)',
  easy: 'h-3.5 bg-(--form-recovery)',
  recovery: 'h-3.5 bg-(--form-recovery)',
  cooldown: 'h-3.5 bg-(--form-recovery)',
  hilly: 'h-6 bg-(--form-progress)',
  effort: 'h-full bg-(--form-overload)',
}

const outline = useSessionOutline(plan)

// The route of the session (#266): the Créer panel's session mode, which this click asks to generate from the
// device's position. Nothing is routed before the click (OpenRouteService quota).
const loop = useLoopGeneratorStore()
const routable = computed(() => hasSessionRoute(plan.value))
function traceSession() {
  loop.fromCoach = true
  navigateTo('/routes/create?mode=session')
}

const distance = computed(() => `${formatNumber(plan.value.distanceM / 1000, { maximumFractionDigits: 1 })} km`)
const gain = computed(() => `${formatNumber(plan.value.gainM)} m`)
const pace = computed(() => t('coachSession.paceValue', { pace: formatPaceSetting('running', easyPace.value.pace) }))
</script>

<template>
  <div class="space-y-4">
    <CoachWeekBand :days="days" :selected="day" @select="select" />
    <section
      class="overflow-hidden rounded-lg border-2 border-(--ui-text-highlighted) bg-default"
      data-testid="coach-session"
      :data-kind="choice ? plan.kind : null"
      :data-minutes="choice ? plan.minutes : null"
      :data-day="day"
      :data-state="shown.state"
    >
      <h2 class="bg-inverted px-4 py-2 text-xs font-bold tracking-[0.08em] text-inverted uppercase [font-family:var(--font-numbers)]" data-testid="coach-session-heading">
        {{ t(isToday ? 'coachSession.heading' : shown.past ? 'coachWeek.headingPast' : 'coachSession.headingOn', { date }) }}
      </h2>
      <div class="space-y-3 p-4">
        <div>
          <div class="flex items-start justify-between gap-3">
            <p class="font-display text-[1.75rem] leading-tight font-bold text-highlighted" data-testid="coach-session-title">
              {{ choice ? t(`coachSession.kinds.${plan.kind}`) : dayTitle }}
            </p>
            <DurationSign v-if="choice && plan.minutes" :minutes="plan.minutes" class="mt-0.5" />
          </div>
          <p class="mt-1.5 text-sm text-toned" data-testid="coach-session-reason">
            {{ choice ? reason : dayText }}
          </p>
          <UButton
            v-if="!choice && !shown.past"
            :label="t('coachWeek.anyway')"
            variant="link"
            class="mt-1 px-0 font-semibold"
            data-testid="coach-session-anyway"
            @click="anyway = true"
          />
          <p v-if="capText" class="mt-1 text-sm text-toned" data-testid="coach-session-capped">
            {{ capText }}
          </p>
          <div v-if="week" class="mt-2.5 space-y-1" data-testid="coach-week" :data-target="Math.round(week.target)" :data-lighter="week.lighter">
            <p class="flex flex-wrap justify-between gap-x-2 text-xs text-toned">
              <span class="font-numbers tabular-nums" data-testid="coach-week-text">{{ weekText }}</span>
              <span v-if="week.tapering" class="font-semibold">{{ t('coachWeek.tapering') }}</span>
              <span v-else-if="week.lighter" class="font-semibold">{{ t('coachWeek.lighter') }}</span>
              <span v-else-if="week.done >= week.target">{{ t('coachWeek.reached') }}</span>
            </p>
            <div
              class="h-1.5 overflow-hidden rounded-full bg-elevated"
              role="meter"
              :aria-label="t('coachWeek.label')"
              aria-valuemin="0"
              :aria-valuemax="Math.round(week.target)"
              :aria-valuenow="Math.round(week.done)"
              :aria-valuetext="weekText ?? ''"
            >
              <div class="h-full rounded-full bg-(--form-progress)" :style="{ width: `${weekShare}%` }" />
            </div>
          </div>
          <p v-if="!isToday && choice && !shown.past" class="mt-1 text-xs text-muted" data-testid="coach-session-ahead">
            {{ t('coachSession.ahead') }}
          </p>
        </div>
        <template v-if="plan.blocks.length">
          <div>
            <div class="flex h-[34px] items-end gap-0.5" role="img" :aria-label="`${t('coachSession.blocks.label')} : ${outline.summary}`" data-testid="coach-session-blocks">
              <span
                v-for="(block, i) in plan.blocks"
                :key="i"
                class="min-w-0.5 basis-0 rounded-[2px]"
                :class="BAR[block.kind]"
                :style="{ flexGrow: block.minutes }"
                :data-block="block.kind"
              />
            </div>
            <div class="mt-1 flex justify-between gap-2 text-xs text-muted" aria-hidden="true">
              <span v-if="outline.start">{{ outline.start }}</span>
              <span :class="{ 'mx-auto': !outline.start }">{{ outline.middle }}</span>
              <span v-if="outline.end">{{ outline.end }}</span>
            </div>
          </div>
          <dl class="grid grid-cols-3 rounded border border-(--ui-text-highlighted)">
            <div class="border-r border-(--ui-text-highlighted) px-2 py-1.5">
              <dt class="text-[11px] tracking-[0.06em] text-muted uppercase">{{ t('coachSession.distance') }}</dt>
              <dd class="font-numbers text-xl font-bold" data-testid="coach-session-distance">{{ distance }}</dd>
            </div>
            <div class="border-r border-(--ui-text-highlighted) px-2 py-1.5">
              <dt class="text-[11px] tracking-[0.06em] text-muted uppercase">{{ t('coachSession.gain') }}</dt>
              <dd class="font-numbers text-xl font-bold">{{ gain }}</dd>
            </div>
            <div class="px-2 py-1.5" :title="t('coachSession.paceTitle')" data-testid="coach-session-pace" :data-source="easyPace.source">
              <dt class="text-[11px] tracking-[0.06em] text-muted uppercase">{{ t('coachSession.pace') }}</dt>
              <dd class="font-numbers text-xl font-bold">{{ pace }}</dd>
            </div>
          </dl>
          <p class="text-xs text-muted" data-testid="coach-session-pace-source">
            {{ t(`coachSession.paceSource.${easyPace.source}`) }}
            <ULink to="/settings#paces" class="text-primary">{{ t('coachSession.paceSettings') }}</ULink>
          </p>
        </template>
        <p v-else-if="choice && plan.kind === 'rest'" class="text-sm text-toned">
          {{ t('coachSession.restText') }}
        </p>
      </div>
    </section>

    <fieldset v-if="choice && !shown.past">
      <legend class="mb-2 font-semibold [font-family:var(--font-numbers)]">{{ t('coachSession.durations') }}</legend>
      <div class="flex flex-wrap gap-1.5" data-testid="coach-session-durations">
        <button
          v-for="duration in SESSION_DURATIONS"
          :key="duration"
          type="button"
          class="min-h-11 rounded-full border-[1.5px] px-3.5 font-semibold transition-colors"
          :class="minutes === duration
            ? 'border-(--ui-text-highlighted) bg-inverted text-inverted'
            : 'border-accented bg-default text-highlighted hover:bg-elevated/50'"
          :aria-pressed="minutes === duration"
          @click="pickMinutes(duration)"
        >
          {{ formatDuration(duration) }}
        </button>
      </div>
    </fieldset>

    <CoachWeatherSlot v-if="choice && forecast" :minutes="plan.minutes" :day="day" />

    <UButton
      v-if="choice && !shown.past && routable"
      :label="t('sessionRoute.fromHome')"
      icon="i-lucide-route"
      size="lg"
      block
      class="min-h-12"
      data-testid="coach-session-route"
      @click="traceSession()"
    />

    <UButton
      v-if="choice && !shown.past && choice.options > 1"
      :label="t('coachSession.other')"
      icon="i-lucide-shuffle"
      color="neutral"
      variant="outline"
      block
      class="min-h-11"
      data-testid="coach-session-other"
      @click="nextSession()"
    />
  </div>
</template>
