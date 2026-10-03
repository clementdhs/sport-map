<script setup lang="ts">
import type { RouteDetail } from '#shared/types/routes'
import type { LngLat } from '#shared/utils/routes'
import type { LiveStats } from '~/utils/liveStats'
import type { Recording } from '~/utils/recorder'
import type { TrackProgress } from '~/utils/trackFollower'
import type { GuideState } from '~/utils/voiceGuide'

const { formatDistance } = useFormat()

// Full-screen "follow the route" mode, for the phone: live position on the track, distance and climb
// left, alert when straying from the track.
definePageMeta({ layout: false })

const route = useRoute()
const { t } = useI18n()
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

const liveStats = computed<LiveStats>(() => {
  const outing = walked.value
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
    speedMs: outing ? currentSpeed(outing.points, now.value) : null,
    averageSpeedMs: average,
    arrivalAt: estimatedArrival(now.value, remainingM, average),
  }
})
</script>

<template>
  <div v-if="parcours" class="flex h-dvh flex-col overflow-hidden">
    <!-- The panel sits below the map, not over it, so the map's attribution stays visible. -->
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteFollow :coordinates="coordinates" :fix="fix" :follow="follow" @stop-follow="follow = false" />
      </ClientOnly>

      <!-- Over the map, which keeps following the position; the top bar stays above it. -->
      <LiveData
        v-if="dataView"
        class="absolute inset-0 z-10 pt-16"
        mode="follow"
        :stats="liveStats"
        :default-pace="parcours.sport_type === 'running'"
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
          <p class="truncate rounded-md bg-default/90 px-2 py-1 text-sm font-medium shadow-md">{{ parcours.name }}</p>
          <VoiceGuideSettings
            class="ml-auto"
            :prefs="voice.prefs.value"
            :supported="voice.supported.value"
            :background="background"
            @update="voice.setPrefs"
          />
          <UButton
            :icon="dataView ? 'i-lucide-map' : 'i-lucide-gauge'"
            :label="dataView ? t('liveData.showMap') : t('liveData.showData')"
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
          <p class="text-lg font-semibold" data-testid="done">{{ progress ? formatDistance(progress.doneM) : '—' }}</p>
        </div>
        <div>
          <p class="text-xs text-muted">{{ t('follow.remaining') }}</p>
          <p class="text-lg font-semibold" data-testid="remaining">
            {{ formatDistance(progress ? progress.remainingM : model.totalM) }}
          </p>
        </div>
        <div>
          <p class="text-xs text-muted">{{ t('follow.remainingGain') }}</p>
          <p class="text-lg font-semibold">
            {{ progress?.remainingGainM != null ? `${Math.round(progress.remainingGainM)} m` : '—' }}
          </p>
        </div>
      </div>
      <UProgress :model-value="percentDone" size="sm" :aria-label="t('follow.percent', { percent: percentDone })" />
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
  </div>
</template>
