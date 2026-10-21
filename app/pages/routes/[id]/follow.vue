<script setup lang="ts">
import type { RouteDetail } from '#shared/types/routes'
import type { LngLat, OutingPayload } from '#shared/utils/routes'
import type { LiveStats } from '~/utils/liveStats'
import type { Recording } from '~/utils/recorder'
import type { TrackProgress } from '~/utils/trackFollower'
import type { GuideState } from '~/utils/voiceGuide'

const { formatDistance, formatDate } = useFormat()

// Full-screen "follow the route" mode, for the phone: live position on the track, distance and climb
// left, alert when straying from the track. The outing can be recorded at the same time: it is then listed on
// the route's page, without creating another route.
definePageMeta({ layout: false })

const route = useRoute()
const { t } = useI18n()
const toast = useToast()
const errorMessage = useErrorMessage()
const { data: parcours, error } = await useFetch<RouteDetail>(`/api/routes/${route.params.id}`)
if (error.value || !parcours.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? t('route.notFound'),
    fatal: true,
  })
}

useSeoMeta({ title: () => `${t('follow.title', { name: parcours.value?.name })} — sport-map` })

const coordinates = computed(() => parcours.value!.geometry.coordinates as LngLat[])
const model = computed(() => {
  const elevations = parcours.value!.elevation_profile
  return buildTrackModel(coordinates.value, elevations?.length === coordinates.value.length ? elevations : null)
})

const { fix, error: gpsError, background } = useWatchPosition()
const { active: screenKeptOn, supported: wakeLockSupported } = useScreenWakeLock()

// Voice guidance, with the climbs worth announcing.
const voice = useVoiceGuide(() => parcours.value!.sport_type)
const routeClimbs = computed(() => {
  const elevations = parcours.value!.elevation_profile
  if (elevations?.length !== coordinates.value.length) return []
  return announcedClimbs(climbs(coordinates.value, elevations, model.value.along))
})
let guideState: GuideState | null = null

// Each fix is located from the previous progress, to follow the right leg where the track passes twice.
const progress = shallowRef<TrackProgress | null>(null)
const offTrack = ref(false)

// The outing itself, measured like a recording (kept in memory only), for the speeds and the arrival time.
const walked = shallowRef<Recording | null>(null)

// The outing recorded on request, kept on the phone like on /record (one draft per route).
const { recording, draft, paused, start, resumeDraft, discardDraft: dropDraft, togglePause, stop } =
  useOutingRecorder(`sport-map:recording:${parcours.value.id}`, fix)

// Position shared with the family on request, until the page is left.
const live = useLiveShare(parcours.value.id, fix)

watch(fix, (current) => {
  if (!current) return
  const time = Date.now()
  walked.value = addFix(walked.value ?? startRecording(time), current, time)
  const next = locateOnTrack(model.value, current.position, progress.value?.doneM ?? null)
  progress.value = next
  // A poor GPS fix must not raise the alert; once raised, it only clears well inside the limit, so that
  // it doesn't flicker around it.
  const limit = Math.max(OFF_TRACK_M, current.accuracyM)
  if (!offTrack.value && next.offTrackM > limit) {
    offTrack.value = true
    navigator.vibrate?.([200, 100, 200])
  }
  else if (offTrack.value && next.offTrackM < limit * 0.6) {
    offTrack.value = false
  }

  const outing = walked.value
  guideState ??= startGuide(outing.startedAt)
  const guided = guide(guideState, {
    now: time,
    elapsedS: (time - outing.startedAt) / 1000,
    distanceM: outing.distanceM,
    averageSpeedMs: averageSpeed(outing.distanceM, outing.movingMs),
    doneM: next.doneM,
    offTrack: offTrack.value,
    arrived: arrived.value,
  }, routeClimbs.value)
  guideState = guided.state
  voice.announce(guided.announcements)
})

const percentDone = computed(() =>
  progress.value && model.value.totalM ? Math.round((progress.value.doneM / model.value.totalM) * 100) : 0)
const arrived = computed(() => !!progress.value && !offTrack.value && progress.value.remainingM < 30)
const follow = ref(true)

// Data screen
const dataView = ref(false)
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 1000)))
onBeforeUnmount(() => clearInterval(clock))

// Times and speeds come from the recording when there is one, so that they match what will be saved.
const liveStats = computed<LiveStats>(() => {
  const outing = recording.value ?? walked.value
  const remainingM = progress.value ? progress.value.remainingM : model.value.totalM
  const totalGainM = model.value.gainLeft?.[0] ?? null
  const remainingGainM = progress.value ? progress.value.remainingGainM : totalGainM
  const average = outing ? averageSpeed(outing.distanceM, outing.movingMs) : null
  return {
    now: now.value,
    elapsedS: outing ? (now.value - outing.startedAt) / 1000 : null,
    distanceM: progress.value?.doneM ?? null,
    remainingM,
    gainM: totalGainM !== null && remainingGainM !== null ? Math.max(0, totalGainM - remainingGainM) : null,
    remainingGainM,
    speedMs: outing && !paused.value ? currentSpeed(outing.points, now.value) : null,
    averageSpeedMs: average,
    arrivalAt: estimatedArrival(now.value, remainingM, average),
  }
})

function discardDraft() {
  if (window.confirm(t('record.discardDraftConfirm'))) dropDraft()
}

// End of the recorded outing
const finishOpen = ref(false)
const saving = ref(false)
function openFinish() {
  if (!recording.value || recording.value.points.length < 2) {
    toast.add({ title: t('record.noTrack'), description: t('record.noTrackHint'), color: 'warning' })
    return
  }
  finishOpen.value = true
}
const finished = computed(() => (recording.value ? outingTimes(recording.value, now.value) : null))

async function saveOuting() {
  const id = parcours.value!.id
  saving.value = true
  try {
    const body: OutingPayload = { ...outingTimes(recording.value!, Date.now()), track: outingTrack(recording.value!) ?? undefined }
    await $fetch(`/api/routes/${id}/outings`, { method: 'POST', body })
    stop()
    toast.add({ title: t('record.saved'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo({ path: `/routes/${id}`, query: { tab: 'outings' } })
  }
  catch (error) {
    toast.add({
      title: t('record.saveFailed'),
      description: t('record.saveFailedHint', { message: errorMessage(error) }),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

function discardOuting() {
  if (!window.confirm(t('record.discardConfirm'))) return
  stop()
  finishOpen.value = false
}
</script>

<template>
  <div v-if="parcours" class="flex h-dvh flex-col overflow-hidden">
    <!-- The panel sits below the map, not over it, so the map's attribution stays visible. -->
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteFollow v-model:follow="follow" :coordinates="coordinates" :fix="fix" :osm-places="parcours.osm_places?.places" />
      </ClientOnly>

      <!-- Over the map, which keeps following the position; the top bar stays above it. -->
      <LiveData
        v-if="dataView"
        class="absolute inset-0 z-10 pt-16"
        mode="follow"
        :stats="liveStats"
        :default-pace="SPORT_KINDS[parcours.sport_type] === 'run'"
      />

      <!-- Right padding: the map controls stay reachable. -->
      <div class="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 p-3" :class="dataView ? 'pr-3' : 'pr-14'">
        <div class="pointer-events-auto flex items-center gap-2">
          <UButton
            :to="`/routes/${parcours.id}`"
            icon="i-lucide-x"
            :label="t('record.quit')"
            color="neutral"
            variant="solid"
            class="shadow-md"
          />
          <!-- No room for it on phones next to the buttons; the page title keeps it. -->
          <p class="hidden truncate rounded-md bg-default/90 px-2 py-1 text-sm font-medium shadow-md sm:block">{{ parcours.name }}</p>
          <OutdoorReadabilityToggle class="ml-auto" />
          <VoiceGuideSettings
            :prefs="voice.prefs.value"
            :supported="voice.supported.value"
            :background="background"
            @update="voice.setPrefs"
          />
          <UButton
            :icon="dataView ? 'i-lucide-map' : 'i-lucide-gauge'"
            :label="dataView ? t('liveData.showMap') : t('liveData.showData')"
            :ui="{ label: 'outdoor:max-sm:sr-only' }"
            color="neutral"
            variant="solid"
            class="shrink-0 shadow-md"
            @click="dataView = !dataView"
          />
        </div>
        <UAlert
          v-if="gpsError"
          class="pointer-events-auto"
          color="warning"
          icon="i-lucide-map-pin-off"
          :title="gpsError"
        />
        <UAlert
          v-else-if="offTrack && progress"
          class="pointer-events-auto"
          color="error"
          icon="i-lucide-triangle-alert"
          :title="t('follow.offTrack')"
          :description="t('follow.offTrackDistance', { distance: formatDistance(progress.offTrackM) })"
        />
        <UAlert
          v-else-if="arrived"
          class="pointer-events-auto"
          color="success"
          icon="i-lucide-flag"
          :title="t('follow.arrived')"
        />
      </div>

      <UButton
        v-if="!follow && fix"
        icon="i-lucide-locate-fixed"
        :label="t('follow.recenter')"
        color="neutral"
        variant="solid"
        class="absolute right-3 bottom-10 shadow-md"
        @click="follow = true"
      />
    </div>

    <div class="shrink-0 space-y-3 border-t border-default bg-default p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-live="polite">
      <div v-if="!dataView" class="grid grid-cols-3 gap-2 text-center">
        <div>
          <p class="text-xs text-muted">{{ t('follow.done') }}</p>
          <p class="font-numbers text-xl font-semibold tabular-nums" data-testid="done">{{ progress ? formatDistance(progress.doneM) : '—' }}</p>
        </div>
        <div>
          <p class="text-xs text-muted">{{ t('follow.remaining') }}</p>
          <p class="font-numbers text-xl font-semibold tabular-nums" data-testid="remaining">
            {{ formatDistance(progress ? progress.remainingM : model.totalM) }}
          </p>
        </div>
        <div>
          <p class="text-xs text-muted">{{ t('follow.remainingGain') }}</p>
          <p class="font-numbers text-xl font-semibold tabular-nums">
            {{ progress?.remainingGainM != null ? `${Math.round(progress.remainingGainM)} m` : '—' }}
          </p>
        </div>
      </div>
      <UProgress :model-value="percentDone" size="sm" :aria-label="t('follow.percent', { percent: percentDone })" />

      <div v-if="recording" class="flex items-center gap-2">
        <UIcon
          :name="paused ? 'i-lucide-pause' : 'i-lucide-circle-dot'"
          class="size-5 shrink-0"
          :class="paused ? 'text-muted' : 'text-error'"
        />
        <p class="min-w-0 text-sm">
          <span class="sr-only">{{ paused ? t('record.paused') : t('record.recording') }}</span>
          <span class="font-numbers text-xl font-semibold tabular-nums" data-testid="recording-elapsed">{{ formatStopwatch(elapsedMs(recording, now) / 1000) }}</span>
        </p>
        <UButton
          class="ml-auto"
          :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
          :label="paused ? t('record.resume') : t('record.pause')"
          color="neutral"
          variant="outline"
          @click="togglePause"
        />
        <UButton icon="i-lucide-square" :label="t('record.finish')" @click="openFinish" />
      </div>
      <div v-else-if="draft" class="space-y-2">
        <p class="text-sm">
          {{ t('record.draft', { date: formatDate(new Date(draft.startedAt).toISOString()), distance: formatDistance(draft.distanceM) }) }}
        </p>
        <div class="grid grid-cols-2 gap-2">
          <UButton :label="t('record.discard')" color="neutral" variant="outline" block @click="discardDraft" />
          <UButton icon="i-lucide-play" :label="t('record.resume')" block @click="resumeDraft" />
        </div>
      </div>
      <UButton
        v-else
        icon="i-lucide-circle-dot"
        :label="t('follow.record')"
        color="neutral"
        variant="outline"
        block
        @click="start"
      />
      <LiveShareControl
        :active="live.active.value"
        :starting="live.starting.value"
        :last-sent-at="live.lastSentAt.value"
        :waiting="live.waiting.value"
        :now="now"
        @start="live.start"
        @stop="live.stop"
      />
      <p class="flex flex-wrap justify-between gap-x-3 text-xs text-muted">
        <span>
          <UIcon name="i-lucide-satellite" class="mr-1 align-text-bottom" />
          {{ fix ? t('follow.accuracy', { accuracy: Math.round(fix.accuracyM) }) : t('follow.searchingPosition') }}
        </span>
        <span v-if="background">
          <UIcon name="i-lucide-moon" class="mr-1 align-text-bottom" />{{ t('follow.backgroundGps') }}
        </span>
        <span v-else-if="screenKeptOn">
          <UIcon name="i-lucide-sun" class="mr-1 align-text-bottom" />{{ t('follow.screenOn') }}
        </span>
        <span v-else-if="!wakeLockSupported">
          <UIcon name="i-lucide-sun-dim" class="mr-1 align-text-bottom" />{{ t('follow.keepScreenOn') }}
        </span>
      </p>
    </div>

    <UModal v-model:open="finishOpen" :title="t('record.finishTitle')" :description="t('follow.finishDescription')">
      <template #body>
        <dl v-if="finished" class="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt class="text-xs text-muted">{{ t('duration.short') }}</dt>
            <dd class="font-semibold">{{ formatElapsed(finished.duration_s) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('outings.moving') }}</dt>
            <dd class="font-semibold">{{ formatElapsed(finished.moving_s) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('route.distance') }}</dt>
            <dd class="font-semibold">{{ formatDistance(finished.distance_m) }}</dd>
          </div>
        </dl>
      </template>
      <template #footer>
        <div class="flex w-full justify-between gap-2">
          <UButton :label="t('record.discardOuting')" color="error" variant="ghost" @click="discardOuting" />
          <UButton :label="t('common.save')" icon="i-lucide-save" :loading="saving" @click="saveOuting" />
        </div>
      </template>
    </UModal>
  </div>
</template>
