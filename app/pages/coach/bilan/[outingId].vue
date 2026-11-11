<script setup lang="ts">
import type { CoachGoal } from '#shared/types/account'
import type { MyProfile, OutingDetail, RecordOuting } from '#shared/types/routes'
import { coachPace } from '#shared/utils/coachPace'
import { formEffect, matchesSession, regularity, repeatTimes, tomorrowSession, type RepeatTimes } from '#shared/utils/coachReview'
import { daySession } from '#shared/utils/coachPlan'
import type { KeyFigure } from '~/utils/keyFigures'
import { countsForForm, FEELINGS, type Feeling } from '#shared/utils/trainingForm'

// The coach's review after an outing (#267, mockup 4), reached once an outing is saved from /record or follow
// mode: the « Séance faite » stamp when it was today's session of the day, the time of each repeat of a hill or
// interval session, the feeling, which weighs the outing's load, and what the outing does to the form, with
// tomorrow's session. Computed in the browser from the profile's outings, like the coach page.
const { t } = useI18n()
const { formatDistance, formatNumber, formatTime } = useFormat()
const toast = useToast()
const errorMessage = useErrorMessage()
useSeoMeta({ title: () => `${t('coachReview.title')} — sportmap` })

const outingId = useRoute().params.outingId as string
const { data: profile, error } = await useFetch<MyProfile>('/api/profile/me')
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}
const { data: savedGoal } = await useFetch<CoachGoal | null>('/api/profile/me/coach-goal')

const saved = computed(() => profile.value?.outings.find(outing => outing.outing_id === outingId) ?? null)
if (!saved.value) throw createError({ statusCode: 404, statusMessage: t('api.outingNotFound'), fatal: true })

// The feeling as last chosen, before the server answers: the form follows it at once.
const feeling = ref<Feeling | null>(saved.value.feeling ?? null)
const outings = computed<RecordOuting[]>(() => (profile.value?.outings ?? [])
  .map(outing => (outing.outing_id === outingId ? { ...outing, feeling: feeling.value } : outing)))
const outing = computed(() => outings.value.find(o => o.outing_id === outingId)!)
const countsInForm = computed(() => countsForForm(outing.value))

// Today's session of the day, as the coach page showed it: from the form before this outing and the duration
// last chosen there (coachChoice.ts), in this browser only.
const paces = usePreference('paces')
// The coach page's pace (#281), from the outings before this one
const easyPace = computed(() => coachPace(others.value, paces.value.running).pace)
const today = localDate(new Date())
// Today's outings only: an older one says nothing about today's session or form.
const isToday = computed(() => localDate(outing.value.completed_at) === today)
const others = computed(() => outings.value.filter(o => o.outing_id !== outingId))
// Only on the client: whether it was the session depends on this browser's choices and detached outings.
const mounted = ref(false)
// The durations and « Autre séance » clicks kept for each day of the week (#279, #285), once mounted
const choiceOf = (date: string) => (mounted.value ? savedCoachChoice(date) : null)
// Today's session in the week plan (#285), as the coach page showed it before this outing
const plan = computed(() => daySession(others.value, {
  goal: savedGoal.value ?? null,
  easyPace: easyPace.value,
  choiceOf,
}, today).plan)

const detached = ref(false)
const sessionRoute = ref<string | null>(null)
onMounted(() => {
  sessionRoute.value = sessionRouteOf(today)
  detached.value = isDetached(outingId)
  mounted.value = true
})
const matches = computed(() => mounted.value
  && countsInForm.value
  && isToday.value
  && matchesSession(plan.value, outing.value.moving_s, outing.value.route_id === sessionRoute.value))
const isSession = computed(() => matches.value && !detached.value)
function toggleDetached() {
  detached.value = !detached.value
  setDetached(outingId, detached.value)
}

// The repeats, from the outing's GPS points, loaded only for a hill or interval session.
const repeats = ref<RepeatTimes | null>(null)
watch(() => isSession.value && !!plan.value.reps, async (needed) => {
  if (!needed || repeats.value) return
  try {
    const { track } = await $fetch<OutingDetail>(`/api/routes/${outing.value.route_id}/outings/${outingId}`)
    repeats.value = repeatTimes(track, plan.value)
  }
  catch {
    // Without its points, the review has no repeats.
  }
})
const shownRepeats = computed(() => (isSession.value ? repeats.value : null))
const repeatsRegularity = computed(() => (shownRepeats.value ? regularity(shownRepeats.value.values) : null))
const repeatValue = (value: number) => (shownRepeats.value?.kind === 'fast'
  ? `${formatPace(1000 / value)} /km`
  : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`)
const regularityText = computed(() => {
  const r = repeatsRegularity.value
  if (!r || !shownRepeats.value) return ''
  const spread = shownRepeats.value.kind === 'fast' ? t('coachReview.spreadPace', { s: r.spread }) : t('coachReview.spreadTime', { s: r.spread })
  const text = t(`coachReview.regularity.${r.level}`, { spread })
  return r.lastSlowest ? `${text} ${t('coachReview.lastSlowest')}` : text
})

// What the outing does to the form, and tomorrow's session if the member doesn't go out again today.
const effect = computed(() => formEffect(outings.value, outing.value))
const ratioText = (ratio: number) => `× ${formatNumber(ratio, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const tomorrow = computed(() => {
  // With this outing among the runs, as the coach page will show tomorrow
  const pace = coachPace(outings.value, paces.value.running).pace
  const next = tomorrowSession(outings.value, { goal: savedGoal.value ?? null, easyPace: pace, choiceOf }, new Date())
  const name = t(`coachSession.kinds.${next.kind}`)
  return next.minutes ? t('coachReview.tomorrowSession', { session: name, duration: formatDuration(next.minutes) }) : name
})

const savingFeeling = ref(false)
async function pickFeeling(value: Feeling) {
  if (value === feeling.value) return
  const before = feeling.value
  feeling.value = value
  savingFeeling.value = true
  try {
    await $fetch(`/api/routes/${outing.value.route_id}/outings/${outingId}`, { method: 'PATCH', body: { feeling: value } })
  }
  catch (failure) {
    feeling.value = before
    toast.add({ title: t('coachReview.feelingFailed'), description: errorMessage(failure), color: 'error' })
  }
  finally {
    savingFeeling.value = false
  }
}

const title = computed(() => (isSession.value ? t(`coachSession.kinds.${plan.value.kind}`) : outing.value.route_name))
const figures = computed<KeyFigure[]>(() => [
  { label: t('coachReview.distance'), value: formatDistance(outing.value.covered_m ?? outing.value.distance_m) },
  { label: t('coachReview.gain'), value: `${formatNumber(Math.round(outing.value.elevation_gain_m ?? 0))} m` },
  { label: t('coachReview.duration'), value: outing.value.moving_s === null ? '—' : formatElapsed(outing.value.moving_s) },
])
</script>

<template>
  <UContainer class="max-w-2xl space-y-5 py-6 sm:py-8" data-testid="coach-review" :data-session="isSession ? plan.kind : undefined">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs font-semibold tracking-[0.08em] text-muted uppercase [font-family:var(--font-numbers)]">
          {{ t('coachReview.finished', { time: formatTime(outing.completed_at) }) }}
        </p>
        <h1 class="mt-0.5 font-display text-[2rem] leading-tight font-bold break-words">{{ title }}</h1>
      </div>
      <p
        v-if="isSession"
        class="mt-1 shrink-0 -rotate-[8deg] rounded-md border-[2.5px] border-error px-2.5 py-1 text-center font-display text-lg leading-tight font-bold tracking-[0.04em] text-error uppercase"
        data-testid="coach-review-stamp"
      >
        {{ t('coachReview.stampLine1') }}<br>{{ t('coachReview.stampLine2') }}
      </p>
    </div>

    <KeyFigures :figures="figures" />

    <section v-if="shownRepeats" class="space-y-2.5 rounded-lg border border-default bg-default p-4" data-testid="coach-review-repeats">
      <h2 class="text-lg font-bold [font-family:var(--font-numbers)]">
        {{ t(`coachReview.repeats.${shownRepeats.kind}`, { n: shownRepeats.values.length }) }}
      </h2>
      <ol class="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 text-sm">
        <li v-for="(value, i) in shownRepeats.values" :key="i" class="contents">
          <span class="font-bold">{{ i + 1 }}</span>
          <span
            class="h-3 rounded-[2px] bg-(--form-overload)"
            :style="{ width: `${(value / Math.max(...shownRepeats.values)) * 100}%` }"
            aria-hidden="true"
          />
          <span class="text-end font-numbers font-bold" data-testid="coach-review-repeat">{{ repeatValue(value) }}</span>
        </li>
      </ol>
      <p class="text-sm text-toned" data-testid="coach-review-regularity">{{ regularityText }}</p>
    </section>

    <fieldset>
      <legend class="mb-1 text-lg font-bold [font-family:var(--font-numbers)]">{{ t('coachReview.feelingTitle') }}</legend>
      <p class="mb-2 text-sm text-muted">{{ t('coachReview.feelingHint') }}</p>
      <div class="grid grid-cols-4 gap-1.5" data-testid="coach-review-feelings">
        <button
          v-for="value in FEELINGS"
          :key="value"
          type="button"
          class="min-h-11 rounded-lg border-[1.5px] px-1 text-sm font-semibold transition-colors"
          :class="feeling === value
            ? 'border-(--ui-text-highlighted) bg-inverted text-inverted'
            : 'border-accented bg-default text-highlighted hover:bg-elevated/50'"
          :aria-pressed="feeling === value"
          :disabled="savingFeeling"
          @click="pickFeeling(value)"
        >
          {{ t(`coachReview.feelings.${value}`) }}
        </button>
      </div>
    </fieldset>

    <section
      v-if="countsInForm && isToday"
      class="space-y-2.5 rounded-lg border-2 border-(--ui-text-highlighted) bg-default p-4"
      data-testid="coach-review-form"
      :data-state="effect.state"
      :data-ratio="effect.after ?? undefined"
    >
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="text-xs font-bold tracking-[0.08em] text-muted uppercase [font-family:var(--font-numbers)]">{{ t('coachForm.title') }}</h2>
        <p v-if="effect.after !== null" class="font-numbers font-bold" data-testid="coach-review-ratio">
          <template v-if="effect.before !== null">{{ ratioText(effect.before) }} → </template>{{ ratioText(effect.after) }}
        </p>
      </div>
      <CoachFormGauge v-if="effect.after !== null" :ratio="effect.after" :before="effect.before" />
      <p class="font-display text-2xl font-bold" data-testid="coach-review-state">{{ t(`coachForm.states.${effect.state}`) }}</p>
      <p class="text-sm" data-testid="coach-review-tomorrow">
        <strong>{{ t('coachReview.tomorrow') }}</strong> {{ tomorrow }}
      </p>
    </section>

    <div class="flex flex-col gap-2">
      <UButton
        :to="{ path: `/routes/${outing.route_id}`, query: { tab: 'outings' } }"
        :label="t('coachReview.done')"
        size="xl"
        block
        class="min-h-12"
      />
      <UButton
        v-if="matches"
        :label="detached ? t('coachReview.attach') : t('coachReview.detach')"
        color="neutral"
        variant="link"
        block
        class="min-h-11 underline"
        data-testid="coach-review-detach"
        @click="toggleDetached"
      />
    </div>
  </UContainer>
</template>
