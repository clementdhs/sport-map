<script setup lang="ts">
import { climbsSummary, hasSessionRoute, sessionHill } from '#shared/utils/sessionRoute'
import type { LoopProposal } from '~/stores/loopGenerator'

// The "Séance" mode of the Créer panel (#266, mockup 3): the coach's session of the day at the top, then loops from
// home at its distance, ranked by its gain and, for hill repeats, by the climbs they go through (`rankForSession`).
// The picked one shows its climbs on the map and the profile, its figures and duration at the member's pace, the
// other proposals under it, and is followed, saved or exported as is. Loops are only asked on a click: here, or
// "Générer le tracé depuis chez moi" on the coach page (`loop.fromCoach`).
const loop = useLoopGeneratorStore()
const editor = useRouteEditorStore()
const { t } = useI18n()
const { formatDistance, formatNumber, locale } = useFormat()
const toast = useToast()
const errorMessage = useErrorMessage()
const estimateDuration = useDurationEstimate()

const coach = useSessionOfTheDay()
const plan = computed(() => coach.choice.value?.plan ?? null)
const outline = useSessionOutline(() => plan.value ?? { kind: 'rest', minutes: 0, blocks: [], reps: null, distanceM: 0, gainM: 0, easyPace: 6 })
// Rest and race days have nothing to trace; a session out of the generator's range neither.
const routable = computed(() => !!plan.value && hasSessionRoute(plan.value))
// Only a different session: the same one worked out again (a preference loading late) keeps its loops.
watch(() => (routable.value ? plan.value : null), (next) => {
  if (JSON.stringify(next) !== JSON.stringify(loop.session)) loop.setSession(next)
}, { immediate: true })

const { locating, locate } = useCurrentPosition()

function generateFrom(point: [number, number]) {
  loop.setStart(point)
  loop.generate()
}

// Opened from the coach page: its click asks for the loops, from the device's position.
onMounted(async () => {
  await coach.load()
  if (!loop.fromCoach) return
  loop.fromCoach = false
  if (routable.value) locate(generateFrom)
})

// The repeats' hill of the session the loops aim at (the store's, which follows `plan`).
const hill = computed(() => (loop.session ? sessionHill(loop.session) : null))
const pickedProposal = computed<LoopProposal | null>(() => (loop.picked === null ? null : loop.proposals[loop.picked] ?? null))
const climbs = computed(() => (hill.value ? pickedProposal.value?.climbs ?? [] : []))
const summary = computed(() => climbsSummary(climbs.value))
// Under the session's outline: how the picked loop's climbs serve the repeats, or that none does.
const climbsText = computed(() => {
  if (!hill.value || !pickedProposal.value) return null
  const found = summary.value
  if (!found) return t('sessionRoute.climbsNone')
  const values = { count: found.count, length: formatDistance(found.lengthM), grade: found.grade, repeats: hill.value.count }
  return found.count >= hill.value.count
    ? t('sessionRoute.climbsEnough', values)
    : t('sessionRoute.climbsFew', values, found.count)
})

// Under the title: the outline of repeats, else why the coach picked the session, as on the coach page.
const explanation = computed(() => {
  const current = coach.choice.value
  if (!current || !routable.value) return t('sessionRoute.nothingToTrace')
  if (current.plan.reps) return outline.value.summary
  return t(`coachSession.reasons.${current.reason}`, { n: current.raceDays ?? 0 }, current.raceDays ?? 1)
})
// « Séance du jour », or the day chosen on the coach page (#279)
const heading = computed(() => {
  if (!plan.value) return ''
  const duration = formatDuration(plan.value.minutes)
  return coach.day.value === localDate(new Date())
    ? t('sessionRoute.heading', { duration })
    : t('sessionRoute.headingOn', { duration, date: dayName() })
})
// A road run, whatever the editor's sport once the route is saved (save() resets it).
const minutesOf = ({ distanceM, gainM }: LoopProposal) => estimateDuration('running', distanceM, gainM)
const gainOf = ({ gainM }: LoopProposal) => `${formatNumber(Math.round(gainM ?? 0))} m`

// Warm-up and cool-down on the ground, under the profile.
const ends = computed(() => {
  const { reps, blocks } = loop.session ?? {}
  if (!reps || !blocks?.length) return null
  return {
    warmup: t('sessionRoute.warmup', { distance: formatDistance(Math.round(blocks[0]!.distanceM / 100) * 100) }),
    cooldown: t('sessionRoute.cooldown', { distance: formatDistance(Math.round(blocks.at(-1)!.distanceM / 100) * 100) }),
  }
})
const profileSteps = computed(() => climbs.value.map((climb, i) => ({ distanceM: climb.endM, label: String(i + 1) })))

// The other proposals, each with its colour on the map.
const others = computed(() => loop.proposals
  .map((proposal, index) => ({ proposal, index }))
  .filter(({ index }) => index !== loop.picked))
function otherText(proposal: LoopProposal) {
  const figures = t('loop.summary', { distance: formatDistance(proposal.distanceM), gain: Math.round(proposal.gainM ?? 0) })
  if (!hill.value) return figures
  return `${figures} · ${t('sessionRoute.climbsCount', { count: proposal.climbs?.length ?? 0 }, proposal.climbs?.length ?? 0)}`
}
const failure = computed(() => (!loop.generating && loop.proposals.length && loop.picked === null
  ? loop.proposals.find(proposal => proposal.error)?.error ?? null
  : null))

// Following, saving and exporting all need the route saved, once per proposal: private, named after the session
// and the day, its outline as description. The route is remembered for that day's review (#267, coachChoice.ts).
const saved = ref<{ seed: number, id: string } | null>(null)
const acting = ref<'follow' | 'save' | 'gpx' | null>(null)
// The session's day: today, or the one chosen on the coach page (#279)
const dayName = () => dayNoon(coach.day.value).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })

async function savedRouteId(): Promise<string | null> {
  const proposal = pickedProposal.value
  if (!proposal || !plan.value) return null
  if (saved.value?.seed === proposal.seed) return saved.value.id
  if (editor.waypoints.length && !window.confirm(t('loop.replaceConfirm'))) return null
  const details = { ...editor.details }
  // The sport first: the loop's segments take its routing profile.
  editor.details.sport_type = 'running'
  editor.loadLoop(proposal)
  Object.assign(editor.details, {
    name: `${t(`coachSession.kinds.${plan.value.kind}`)} — ${dayName()}`,
    description: outline.value.summary,
    is_public: false,
  })
  let id: string
  try {
    id = await editor.save()
  }
  catch (error) {
    // The editor gets back the track and details it had (a draft drawn by hand, or nothing).
    editor.undo()
    Object.assign(editor.details, details)
    throw error
  }
  saveSessionRoute(id, coach.day.value)
  saved.value = { seed: proposal.seed, id }
  return id
}

async function act(action: 'follow' | 'save' | 'gpx') {
  acting.value = action
  try {
    const id = await savedRouteId()
    if (!id) return
    if (action === 'follow') {
      // Back from following leads where the editor was opened from (the coach page).
      await navigateTo(`/routes/${id}/follow`, { replace: true })
    }
    else if (action === 'save') {
      toast.add({ title: t('editor.saved'), color: 'success', icon: 'i-lucide-check' })
      await navigateTo(`/routes/${id}`, { replace: true })
    }
    else {
      const link = document.createElement('a')
      link.href = `/api/routes/${id}/gpx`
      link.download = ''
      link.click()
      toast.add({ title: t('sessionRoute.gpxSaved'), color: 'success', icon: 'i-lucide-download' })
    }
  }
  catch (error) {
    toast.add({ title: t('editor.saveFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    acting.value = null
  }
}
</script>

<template>
  <section class="space-y-4" aria-labelledby="session-route-title" data-testid="session-route">
    <p v-if="coach.status.value === 'loading' || coach.status.value === 'idle'" class="flex items-center gap-2 text-sm text-muted" role="status">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />{{ t('sessionRoute.loading') }}
    </p>
    <div v-else-if="coach.status.value === 'failed'" class="space-y-2" role="alert">
      <p class="text-sm text-highlighted">{{ t('sessionRoute.loadFailed') }}</p>
      <UButton :label="t('sessionRoute.retry')" color="neutral" variant="outline" @click="coach.load()" />
    </div>

    <template v-else-if="plan">
      <div>
        <p class="text-xs font-semibold tracking-[0.08em] text-muted uppercase [font-family:var(--font-numbers)]">{{ heading }}</p>
        <h2 id="session-route-title" class="mt-0.5 font-display text-[1.75rem] leading-tight font-bold text-highlighted" data-testid="session-route-title">
          {{ t(`coachSession.kinds.${plan.kind}`) }}
        </h2>
        <p class="mt-1.5 text-sm text-toned">{{ explanation }}</p>
        <p v-if="climbsText" class="mt-1.5 text-sm text-highlighted" role="status" data-testid="session-route-climbs">{{ climbsText }}</p>
      </div>

      <template v-if="!routable">
        <UButton :label="t('sessionRoute.backToCoach')" to="/coach" color="neutral" variant="outline" block class="ring-[1.5px] ring-(--ui-border-inverted)" />
      </template>

      <template v-else>
        <LoopStartRow :busy="locating" />

        <UButton
          v-if="!loop.proposals.length"
          icon="i-lucide-wand-sparkles"
          :label="t('sessionRoute.generate')"
          size="lg"
          block
          :loading="loop.generating || locating"
          :disabled="!loop.canGenerate"
          @click="loop.generate()"
        />

        <p v-else-if="loop.picked === null && loop.generating" class="flex items-center gap-2 text-sm text-muted" role="status">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />{{ t('editor.routing') }}
        </p>
        <p v-else-if="failure" class="text-sm text-muted" role="alert">{{ failure }}</p>

        <template v-if="pickedProposal">
          <!-- Distance and gain in a ruled cartouche, the duration at the member's pace on the yellow sign. -->
          <div class="flex items-stretch gap-2.5">
            <dl class="grid flex-1 grid-cols-2 rounded border border-(--ui-text-highlighted)">
              <div class="border-r border-(--ui-text-highlighted) px-2.5 py-1.5">
                <dt class="text-[11px] tracking-[0.06em] text-muted uppercase">{{ t('coachSession.distance') }}</dt>
                <dd class="font-numbers text-[1.375rem] font-bold" data-testid="session-route-distance">{{ formatDistance(pickedProposal.distanceM) }}</dd>
              </div>
              <div class="px-2.5 py-1.5">
                <dt class="text-[11px] tracking-[0.06em] text-muted uppercase">{{ t('coachSession.gain') }}</dt>
                <dd class="font-numbers text-[1.375rem] font-bold">{{ gainOf(pickedProposal) }}</dd>
              </div>
            </dl>
            <DurationSign :minutes="minutesOf(pickedProposal)" class="self-center" />
          </div>

          <div v-if="pickedProposal.elevations && pickedProposal.coordinates.length >= 2">
            <ElevationProfile
              :coordinates="pickedProposal.coordinates"
              :elevations="pickedProposal.elevations"
              :steps="profileSteps"
              :marks="climbs"
            />
            <p v-if="ends" class="mt-1 flex justify-between gap-2 text-xs text-muted" data-testid="session-route-ends">
              <span>{{ ends.warmup }}</span><span>{{ ends.cooldown }}</span>
            </p>
          </div>

          <UButton
            v-if="climbsText && !summary && (coach.choice.value?.options ?? 0) > 1"
            :label="t('coachSession.other')"
            icon="i-lucide-shuffle"
            color="neutral"
            variant="outline"
            block
            class="ring-[1.5px] ring-(--ui-border-inverted)"
            @click="coach.other()"
          />
        </template>

        <div v-if="loop.proposals.length">
          <div class="flex items-center gap-2.5">
            <h3 id="session-route-others" class="text-[0.6875rem] font-bold tracking-wider whitespace-nowrap text-muted uppercase">{{ t('sessionRoute.others') }}</h3>
            <span class="h-px flex-1 bg-accented" aria-hidden="true" />
          </div>
          <ul class="mt-1" aria-labelledby="session-route-others" aria-live="polite">
            <li v-for="{ proposal, index } in others" :key="proposal.seed" class="border-b border-default">
              <button
                type="button"
                :disabled="proposal.status !== 'ready'"
                class="flex min-h-12 w-full items-center gap-2.5 text-start text-sm text-highlighted focus-visible:outline-2 focus-visible:outline-primary enabled:hover:bg-elevated/50"
                @click="loop.highlighted = index"
              >
                <span
                  class="h-1 w-4.5 shrink-0 rounded-full bg-(--loop-light) dark:bg-(--loop-dark)"
                  :style="{ '--loop-light': LOOP_COLORS[index % LOOP_COLORS.length]!.light, '--loop-dark': LOOP_COLORS[index % LOOP_COLORS.length]!.dark }"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="sr-only">{{ t('loop.proposal', { n: index + 1 }) }} : </span>
                  <template v-if="proposal.status === 'ready'">{{ otherText(proposal) }}</template>
                  <span v-else-if="proposal.status === 'loading'" class="text-muted">
                    <UIcon name="i-lucide-loader-circle" class="mr-1 size-4 animate-spin align-text-bottom" />{{ t('editor.routing') }}
                  </span>
                  <span v-else class="text-muted">{{ proposal.error }}</span>
                </span>
                <span v-if="proposal.status === 'ready'" class="font-numbers font-bold tabular-nums">{{ formatDuration(minutesOf(proposal)) }}</span>
              </button>
            </li>
          </ul>
          <UButton
            :label="t('loop.regenerate')"
            color="neutral"
            variant="ghost"
            size="sm"
            class="mt-1"
            :loading="loop.generating"
            :disabled="!loop.canGenerate"
            @click="loop.generate()"
          />
        </div>

        <div v-if="pickedProposal" class="space-y-2">
          <UButton
            icon="i-lucide-play"
            :label="t('sessionRoute.follow')"
            size="lg"
            block
            :loading="acting === 'follow'"
            :disabled="!!acting"
            @click="act('follow')"
          />
          <div class="grid grid-cols-2 gap-2">
            <UButton
              :label="t('sessionRoute.save')"
              color="neutral"
              variant="outline"
              block
              class="ring-[1.5px] ring-(--ui-border-inverted)"
              :loading="acting === 'save'"
              :disabled="!!acting"
              @click="act('save')"
            />
            <UButton
              :label="t('sessionRoute.gpx')"
              color="neutral"
              variant="outline"
              block
              class="ring-[1.5px] ring-(--ui-border-inverted)"
              :loading="acting === 'gpx'"
              :disabled="!!acting"
              @click="act('gpx')"
            />
          </div>
        </div>
        <p class="text-xs text-muted">{{ t('loop.quotaHint', { attempts: LOOP_ATTEMPTS }) }}</p>
      </template>
    </template>
  </section>
</template>
