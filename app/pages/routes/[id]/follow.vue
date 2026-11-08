<script setup lang="ts">
import type { RouteDetail } from '#shared/types/routes'
import type { LngLat, OutingPayload } from '#shared/utils/routes'
import type { MeasuredStats } from '~/utils/liveStats'
import type { Recording } from '~/utils/recorder'
import type { TrackProgress } from '~/utils/trackFollower'
import type { GuideState } from '~/utils/voiceGuide'

const { formatDistance, formatDate, locale } = useFormat()

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

useSeoMeta({ title: () => `${t('follow.title', { name: parcours.value?.name })} — sportmap` })

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
const { recording, draft, paused, start, resumeDraft, discardDraft: dropDraft, togglePause, lap: recordLap, stop } =
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

// Times, speeds and laps come from the recording when there is one, so that they match what will be saved.
const liveOuting = computed(() => recording.value ?? walked.value)
const maxSpeedOf = maxSpeedTracker()
// Measured once per new point, not every second.
const maxSpeedMs = computed(() => (liveOuting.value ? maxSpeedOf(liveOuting.value.points) : null))
const liveStats = computed<MeasuredStats>(() => {
  const current = liveOuting.value
  const remainingM = progress.value ? progress.value.remainingM : model.value.totalM
  const totalGainM = model.value.gainLeft?.[0] ?? null
  const remainingGainM = progress.value ? progress.value.remainingGainM : totalGainM
  const totalLossM = model.value.lossLeft?.[0] ?? null
  const remainingLossM = progress.value ? progress.value.remainingLossM : totalLossM
  const average = current ? averageSpeed(current.distanceM, current.movingMs) : null
  const lap = current ? currentLap(current, now.value) : null
  return {
    now: now.value,
    elapsedS: current ? (now.value - current.startedAt) / 1000 : null,
    movingS: current ? current.movingMs / 1000 : null,
    lapElapsedS: lap?.elapsedS ?? null,
    lapDistanceM: lap?.distanceM ?? null,
    distanceM: progress.value?.doneM ?? null,
    remainingM,
    gainM: totalGainM !== null && remainingGainM !== null ? Math.max(0, totalGainM - remainingGainM) : null,
    remainingGainM,
    lossM: totalLossM !== null && remainingLossM !== null ? Math.max(0, totalLossM - remainingLossM) : null,
    // The route's elevation where the walker is, steadier than the GPS one; off the track, the GPS one.
    altitudeM: offTrack.value
      ? (fix.value && fix.value.accuracyM <= MAX_ACCURACY_M ? fix.value.altitudeM : null)
      : progress.value?.altitudeM ?? null,
    speedMs: current && !paused.value ? currentSpeed(current.points, now.value) : null,
    averageSpeedMs: average,
    maxSpeedMs: maxSpeedMs.value,
    arrivalAt: estimatedArrival(now.value, remainingM, average),
    lapNumber: lap?.number ?? null,
  }
})

// The bottom panel (#235): the covered part on the map and the mini profile, three figures, the arrival sign.
const doneFraction = computed(() => (progress.value && model.value.totalM ? progress.value.doneM / model.value.totalM : 0))
const profile = computed(() => {
  const elevations = model.value.elevations
  return elevations ? { along: model.value.along, elevations } : null
})
const progressLabel = computed(() => t('follow.progress', {
  done: formatDistance(progress.value?.doneM ?? 0),
  total: formatDistance(model.value.totalM),
  percent: percentDone.value,
}))
const liveDataPrefs = usePreference('liveData')
const paces = usePreference('paces')
// Pace or speed as on the data screen: the member's choice, else pace for running routes.
const defaultPace = computed(() => SPORT_KINDS[parcours.value!.sport_type] === 'run')
const pace = computed(() => liveDataPrefs.value.pace ?? defaultPace.value)
const paceFigure = computed(() => liveValue('averageSpeed', { ...liveStats.value, batteryLevel: null }, pace.value, locale()))
const doneFigure = computed(() => splitUnit(formatDistance(progress.value?.doneM ?? 0)))
const remainingMinutes = computed(() => {
  if (arrived.value) return null
  const stats = liveStats.value
  const sport = parcours.value!.sport_type
  return Math.round(remainingDurationMin(sport, stats.remainingM ?? 0, stats.remainingGainM, stats.averageSpeedMs, paces.value[sport]))
})

// "Tour" on the data screen: kept with the recording, else with the outing in memory.
function startLap() {
  if (recording.value) recordLap()
  else if (walked.value) walked.value = markLap(walked.value, Date.now())
}

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
  <div v-if="parcours" class="flex h-dvh flex-col overflow-hidden bg-paper">
    <!-- The panel sits below the map, not over it, so the map's attribution stays visible. -->
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteFollow
          v-model:follow="follow"
          :coordinates="coordinates"
          :fix="fix"
          :covered="dataView"
          :done-fraction="doneFraction"
          :osm-places="parcours.osm_places?.places"
        />
      </ClientOnly>

      <!-- Over the map, which keeps following the position; the top bar stays above it. -->
      <LiveData
        v-if="dataView"
        class="absolute inset-0 z-10 pt-20"
        mode="follow"
        :stats="liveStats"
        :default-pace="defaultPace"
        :sport="parcours.sport_type"
        :route-name="parcours.name"
        @lap="startLap"
      />

      <!-- Right padding: the map controls stay reachable. -->
      <div class="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 p-3" :class="dataView ? 'pr-3' : 'pr-14'">
        <div class="map-float pointer-events-auto flex items-center gap-1 rounded-lg p-1.5">
          <UButton
            :to="`/routes/${parcours.id}`"
            icon="i-lucide-x"
            :aria-label="t('record.quit')"
            color="neutral"
            variant="ghost"
            size="lg"
          />
          <p class="min-w-0 flex-1 leading-tight">
            <span class="block text-[0.625rem] font-bold tracking-widest text-muted uppercase">{{ t('follow.inProgress') }}</span>
            <span class="block truncate font-display text-lg font-bold">{{ parcours.name }}</span>
          </p>
          <OutdoorReadabilityToggle />
          <VoiceGuideSettings
            :prefs="voice.prefs.value"
            :supported="voice.supported.value"
            :background="background"
            @update="voice.setPrefs"
          />
        </div>
        <!-- The shadow on a wrapper: the sign's clip-path would cut it off. -->
        <div v-if="!dataView && !arrived" class="drop-shadow-md">
          <ArrivalSign :distance="formatDistance(progress ? progress.remainingM : model.totalM)" :minutes="remainingMinutes" />
        </div>
        <UAlert
          v-if="gpsError"
          class="pointer-events-auto"
          color="warning"
          variant="solid"
          icon="i-lucide-map-pin-off"
          :title="gpsError"
        />
        <UAlert
          v-else-if="offTrack && progress"
          class="pointer-events-auto"
          color="error"
          variant="solid"
          icon="i-lucide-triangle-alert"
          :title="t('follow.offTrack')"
          :description="t('follow.offTrackDistance', { distance: formatDistance(progress.offTrackM) })"
        />
        <UAlert
          v-else-if="arrived"
          class="pointer-events-auto"
          color="success"
          variant="solid"
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
        size="lg"
        class="absolute right-3 bottom-8 shadow-md"
        @click="follow = true"
      />
    </div>

    <section
      class="z-10 shrink-0 space-y-3 rounded-t-[22px] bg-paper px-4 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(29_37_32/0.12)]"
      :aria-label="t('follow.panel')"
    >
      <template v-if="!dataView">
        <FollowProfile v-if="profile" :along="profile.along" :elevations="profile.elevations" :done-m="progress?.doneM ?? null" :label="progressLabel" />
        <UProgress v-else :model-value="percentDone" size="sm" :aria-label="progressLabel" />
        <dl class="grid grid-cols-3 border-y border-accented" aria-live="polite">
          <div class="min-w-0 py-2">
            <dt class="live-label">{{ t('follow.done') }}</dt>
            <dd class="live-figure" data-testid="done">
              {{ doneFigure[0] }}{{ ' ' }}<span v-if="doneFigure[1]" class="live-unit">{{ doneFigure[1] }}</span>
            </dd>
          </div>
          <div class="min-w-0 border-s border-accented py-2 ps-3">
            <dt class="live-label">{{ t('follow.time') }}</dt>
            <!-- Not announced: it changes every second. -->
            <dd class="live-figure" aria-live="off" :data-testid="recording ? 'recording-elapsed' : undefined">
              {{ liveStats.elapsedS === null ? '—' : formatStopwatch(liveStats.elapsedS) }}
            </dd>
          </div>
          <div class="min-w-0 border-s border-accented py-2 ps-3">
            <dt class="live-label">{{ pace ? t('liveData.pace') : t('liveData.speed') }}</dt>
            <dd class="live-figure">
              {{ paceFigure.value }}{{ ' ' }}<span v-if="paceFigure.unit" class="live-unit">{{ paceFigure.unit }}</span>
            </dd>
          </div>
        </dl>
      </template>

      <template v-if="recording">
        <div class="flex items-center gap-2">
          <span class="size-3 shrink-0 rounded-full" :class="paused ? 'bg-(--ui-text-muted)' : 'bg-error'" aria-hidden="true" />
          <p class="min-w-0 flex-1 truncate text-sm font-semibold">
            {{ paused ? t('record.paused') : t('record.recording') }}
            <span v-if="dataView" class="ms-1 font-numbers text-base tabular-nums" data-testid="recording-elapsed">{{ formatStopwatch(elapsedMs(recording, now) / 1000) }}</span>
          </p>
          <UButton
            :icon="dataView ? 'i-lucide-map' : 'i-lucide-chart-column'"
            :label="dataView ? t('liveData.showMap') : t('liveData.showData')"
            color="neutral"
            variant="outline"
            size="lg"
            class="shrink-0 ring-[1.5px] ring-(--ui-border-inverted)"
            @click="dataView = !dataView"
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
            :label="paused ? t('record.resume') : t('record.pause')"
            color="neutral"
            variant="outline"
            size="xl"
            block
            class="h-14 rounded-lg font-bold ring-[1.5px] ring-(--ui-border-inverted)"
            @click="togglePause"
          />
          <UButton icon="i-lucide-square" :label="t('record.finish')" size="xl" block class="h-14 rounded-lg font-bold" @click="openFinish" />
        </div>
      </template>
      <template v-else>
        <div v-if="draft" class="space-y-2">
          <p class="text-sm">
            {{ t('record.draft', { date: formatDate(new Date(draft.startedAt).toISOString()), distance: formatDistance(draft.distanceM) }) }}
          </p>
          <div class="grid grid-cols-2 gap-2">
            <UButton :label="t('record.discard')" color="neutral" variant="outline" size="lg" block @click="discardDraft" />
            <UButton icon="i-lucide-play" :label="t('record.resume')" size="lg" block @click="resumeDraft" />
          </div>
        </div>
        <div class="flex gap-2">
          <UButton
            :icon="dataView ? 'i-lucide-map' : 'i-lucide-chart-column'"
            :label="dataView ? t('liveData.showMap') : t('liveData.showData')"
            color="neutral"
            variant="outline"
            size="xl"
            class="h-13 shrink-0 rounded-lg ring-[1.5px] ring-(--ui-border-inverted)"
            @click="dataView = !dataView"
          />
          <UButton
            v-if="!draft"
            :label="t('follow.record')"
            size="xl"
            block
            class="h-13 min-w-0 flex-1 rounded-lg"
            @click="start"
          >
            <template #leading>
              <span class="size-3 shrink-0 rounded-full bg-(--sign)" aria-hidden="true" />
            </template>
          </UButton>
        </div>
      </template>
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
    </section>

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

