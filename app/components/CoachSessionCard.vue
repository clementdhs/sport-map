<script setup lang="ts">
import type { CoachGoal } from '#shared/types/account'
import { coachPace, type PaceOuting } from '#shared/utils/coachPace'
import { weekVolume } from '#shared/utils/coachWeek'
import {
  coachDays,
  dayNoon,
  DEFAULT_SESSION_DURATION,
  SESSION_DURATIONS,
  sessionOn,
  type BlockKind,
  type SessionDuration,
} from '#shared/utils/coachSessions'
import type { LoadOuting } from '#shared/utils/trainingForm'

// "Séance du jour" on the coach page (#264, mockup 1): the session the rules pick from the form, the goal and the
// time available, its blocks, distance, gain and easy pace, the day and duration pickers and "Autre séance". The
// choices are kept in this browser for each day (coachChoice.ts): the same inputs give the same session all day.
// Another day than today (#279) gets the session of that day's form if the member doesn't go out before it.
const props = defineProps<{
  outings: (LoadOuting & PaceOuting)[]
  goal: CoachGoal | null
}>()

const { t } = useI18n()
const { formatNumber, locale } = useFormat()
const paces = usePreference('paces')

// Today and the next days the forecast covers (#279), today first
const days = coachDays()
const day = ref(days[0]!)
const minutes = ref<SessionDuration>(DEFAULT_SESSION_DURATION)
// Clicks on "Autre séance", back to the session of the day with each duration
const other = ref(0)
watch(minutes, () => { other.value = 0 })

// The choice kept for a day, else the duration shown so far: switching days keeps the time the member has.
// Nothing is saved meanwhile, so the day's « Autre séance » isn't written over by the reset in between.
let restoring = false
async function restore(date: string) {
  restoring = true
  const saved = savedCoachChoice(date)
  if (saved) minutes.value = saved.minutes
  // After the reset of « Autre séance » that changing the duration triggers
  await nextTick()
  other.value = saved?.other ?? 0
  await nextTick()
  restoring = false
}

// Kept in this browser for each day (#267): shown again on the next visit, and the review after that day's outing
// looks for this same session. Restored once mounted, so the server's render (today, 60 min) hydrates as is.
onMounted(async () => {
  day.value = loadCoachDay()
  await restore(day.value)
  watch(day, async (value) => {
    saveCoachDay(value)
    await restore(value)
  })
  watch([minutes, other], () => {
    if (!restoring) saveCoachChoice({ minutes: minutes.value, other: other.value }, day.value)
  })
})

const isToday = computed(() => day.value === days[0])
function dayDate(date: string, options: Intl.DateTimeFormatOptions) {
  return dayNoon(date).toLocaleDateString(locale(), { ...options, timeZone: 'Europe/Paris' })
}
function dayLabel(date: string, i: number) {
  if (i === 0) return t('coachSession.today')
  if (i === 1) return t('coachSession.tomorrow')
  return dayDate(date, { weekday: 'short', day: 'numeric' })
}
const date = computed(() => dayDate(day.value, { weekday: 'short', day: 'numeric', month: 'short' }))

// Runs are planned at the member's running pace (#146), else one from their latest runs, else the default (#281).
const easyPace = computed(() => coachPace(props.outings, paces.value.running))
// The rules on the chosen day's form: today's, or a later day's if the member doesn't go out before it.
const choice = computed(() => sessionOn(props.outings, { goal: props.goal, minutes: minutes.value, easyPace: easyPace.value.pace }, day.value, other.value))
const plan = computed(() => choice.value.plan)

const reason = computed(() => {
  const { reason, raceDays } = choice.value
  return t(`coachSession.reasons.${reason}`, { n: raceDays ?? 0 }, raceDays ?? 1)
})
// Shortened to what the member's recent outings allow (#281)
const capText = computed(() => {
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
    <section
      class="overflow-hidden rounded-lg border-2 border-(--ui-text-highlighted) bg-default"
      data-testid="coach-session"
      :data-kind="plan.kind"
      :data-minutes="plan.minutes"
      :data-day="day"
    >
      <h2 class="bg-inverted px-4 py-2 text-xs font-bold tracking-[0.08em] text-inverted uppercase [font-family:var(--font-numbers)]" data-testid="coach-session-heading">
        {{ t(isToday ? 'coachSession.heading' : 'coachSession.headingOn', { date }) }}
      </h2>
      <div class="space-y-3 p-4">
        <div>
          <div class="flex items-start justify-between gap-3">
            <p class="font-display text-[1.75rem] leading-tight font-bold text-highlighted" data-testid="coach-session-title">
              {{ t(`coachSession.kinds.${plan.kind}`) }}
            </p>
            <DurationSign v-if="plan.minutes" :minutes="plan.minutes" class="mt-0.5" />
          </div>
          <p class="mt-1.5 text-sm text-toned" data-testid="coach-session-reason">
            {{ reason }}
          </p>
          <p v-if="capText" class="mt-1 text-sm text-toned" data-testid="coach-session-capped">
            {{ capText }}
          </p>
          <div v-if="week" class="mt-2.5 space-y-1" data-testid="coach-week" :data-target="Math.round(week.target)" :data-lighter="week.lighter">
            <p class="flex flex-wrap justify-between gap-x-2 text-xs text-toned">
              <span class="font-numbers tabular-nums" data-testid="coach-week-text">{{ weekText }}</span>
              <span v-if="week.lighter" class="font-semibold">{{ t('coachWeek.lighter') }}</span>
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
          <p v-if="!isToday" class="mt-1 text-xs text-muted" data-testid="coach-session-ahead">
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
        <p v-else-if="plan.kind === 'rest'" class="text-sm text-toned">
          {{ t('coachSession.restText') }}
        </p>
      </div>
    </section>

    <fieldset>
      <legend class="mb-2 font-semibold [font-family:var(--font-numbers)]">{{ t('coachSession.days') }}</legend>
      <div class="flex flex-wrap gap-1.5" data-testid="coach-session-days">
        <button
          v-for="(option, i) in days"
          :key="option"
          type="button"
          class="min-h-11 rounded-full border-[1.5px] px-3.5 font-semibold transition-colors"
          :class="day === option
            ? 'border-(--ui-text-highlighted) bg-inverted text-inverted'
            : 'border-accented bg-default text-highlighted hover:bg-elevated/50'"
          :aria-pressed="day === option"
          :data-day="option"
          @click="day = option"
        >
          {{ dayLabel(option, i) }}
        </button>
      </div>
    </fieldset>

    <fieldset>
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
          @click="minutes = duration"
        >
          {{ formatDuration(duration) }}
        </button>
      </div>
    </fieldset>

    <CoachWeatherSlot :minutes="plan.minutes" :day="day" />

    <UButton
      v-if="routable"
      :label="t('sessionRoute.fromHome')"
      icon="i-lucide-route"
      size="lg"
      block
      class="min-h-12"
      data-testid="coach-session-route"
      @click="traceSession()"
    />

    <UButton
      v-if="choice.options > 1"
      :label="t('coachSession.other')"
      icon="i-lucide-shuffle"
      color="neutral"
      variant="outline"
      block
      class="min-h-11"
      data-testid="coach-session-other"
      @click="other++"
    />
  </div>
</template>
