<script setup lang="ts">
import type { CoachGoal } from '#shared/types/account'
import { DEFAULT_PACES } from '#shared/utils/routes'
import {
  DEFAULT_SESSION_DURATION,
  outingDaysBefore,
  SESSION_DURATIONS,
  sessionOfTheDay,
  type BlockKind,
  type SessionDuration,
} from '#shared/utils/coachSessions'
import type { FormSummary, LoadOuting } from '#shared/utils/trainingForm'

// "Séance du jour" on the coach page (#264, mockup 1): the session the rules pick from the form, the goal and the
// time available, its blocks, distance, gain and easy pace, the duration picker and "Autre séance". The choices
// are kept in this browser for the day (coachChoice.ts): the same inputs give the same session all day.
const props = defineProps<{
  outings: LoadOuting[]
  form: FormSummary
  goal: CoachGoal | null
  // Today, as written at the top of the page
  date: string
}>()

const { t } = useI18n()
const { formatNumber } = useFormat()
const paces = usePreference('paces')

const minutes = ref<SessionDuration>(DEFAULT_SESSION_DURATION)
// Clicks on "Autre séance", back to the session of the day with each duration
const other = ref(0)
watch(minutes, () => { other.value = 0 })
// Kept in this browser for the day (#267): shown again on the next visit, and the review after today's outing
// looks for this same session. Restored once mounted, so the server's render (60 min) hydrates as is.
onMounted(async () => {
  const saved = loadCoachChoice(localDate(new Date()))
  minutes.value = saved.minutes
  // After the reset of « Autre séance » that changing the duration triggers
  await nextTick()
  other.value = saved.other
  watch([minutes, other], () => saveCoachChoice({ minutes: minutes.value, other: other.value }, localDate(new Date())))
})

// Runs are planned at the member's running pace (#146), the default one without a setting.
const easyPace = computed(() => paces.value.running ?? DEFAULT_PACES.running)
// Apart from the choice: it only changes with the outings, not with the duration or "Autre séance".
const outingDays = computed(() => outingDaysBefore(props.outings, props.form.historyDays))
const choice = computed(() => sessionOfTheDay({
  state: props.form.state,
  ratio: props.form.ratio,
  goal: props.goal,
  minutes: minutes.value,
  outingDays: outingDays.value,
  easyPace: easyPace.value,
  today: localDate(new Date()),
}, other.value))
const plan = computed(() => choice.value.plan)

const reason = computed(() => {
  const { reason, raceDays } = choice.value
  return t(`coachSession.reasons.${reason}`, { n: raceDays ?? 0 }, raceDays ?? 1)
})

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

const minutesText = (value: number) => (value < 1 ? `${Math.round(value * 60)} s` : `${formatNumber(value)} min`)
const outline = computed(() => {
  const { blocks, reps, kind } = plan.value
  if (!reps) {
    const middle = t(`coachSession.blocks.${kind === 'longHilly' ? 'hilly' : kind === 'recovery' ? 'recovery' : 'easy'}`)
    return { start: null, middle, end: null, summary: middle }
  }
  const values = { count: reps.count, effort: minutesText(reps.effortMin), recovery: minutesText(reps.recoveryMin) }
  return {
    start: t('coachSession.blocks.warmup'),
    middle: t(`coachSession.blocks.${reps.hill ? 'hills' : 'fast'}`, values),
    end: t('coachSession.blocks.cooldown'),
    summary: t('coachSession.blocks.summary', {
      warmup: minutesText(blocks[0]!.minutes),
      reps: t(`coachSession.blocks.${reps.hill ? 'hillsDetail' : 'fastDetail'}`, values),
      cooldown: minutesText(blocks.at(-1)!.minutes),
    }),
  }
})

const distance = computed(() => `${formatNumber(plan.value.distanceM / 1000, { maximumFractionDigits: 1 })} km`)
const gain = computed(() => `${formatNumber(plan.value.gainM)} m`)
const pace = computed(() => t('coachSession.paceValue', { pace: formatPaceSetting('running', easyPace.value) }))
</script>

<template>
  <div class="space-y-4">
    <section
      class="overflow-hidden rounded-lg border-2 border-(--ui-text-highlighted) bg-default"
      data-testid="coach-session"
      :data-kind="plan.kind"
      :data-minutes="plan.minutes"
    >
      <h2 class="bg-inverted px-4 py-2 text-xs font-bold tracking-[0.08em] text-inverted uppercase [font-family:var(--font-numbers)]">
        {{ t('coachSession.heading', { date }) }}
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
            <div class="px-2 py-1.5" :title="t('coachSession.paceTitle')">
              <dt class="text-[11px] tracking-[0.06em] text-muted uppercase">{{ t('coachSession.pace') }}</dt>
              <dd class="font-numbers text-xl font-bold">{{ pace }}</dd>
            </div>
          </dl>
        </template>
        <p v-else-if="plan.kind === 'rest'" class="text-sm text-toned">
          {{ t('coachSession.restText') }}
        </p>
      </div>
    </section>

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

    <CoachWeatherSlot :minutes="plan.minutes" />

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
