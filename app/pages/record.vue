<script setup lang="ts">
import type { LngLat, RecordingPayload, SportType } from '#shared/utils/routes'
import type { MeasuredStats } from '~/utils/liveStats'

const { formatDistance, formatDate, formatSpeed } = useFormat()

// Records an outing with the phone's GPS, then saves it as a new route marked as done. A web page only gets
// positions while the screen is on: the screen is kept on, and the recording can be resumed if the page closes.
definePageMeta({ layout: false })
const { t } = useI18n()
const routeDetailsSchemaLocalized = useLocalizedSchema(routeDetailsSchema)
useSeoMeta({ title: () => `${t('header.record')} — sportmap` })

const toast = useToast()
const errorMessage = useErrorMessage()
const { fix, error: gpsError, background } = useWatchPosition()
const { active: screenKeptOn, supported: wakeLockSupported } = useScreenWakeLock()

const { recording, draft, paused, start, resumeDraft, discardDraft: dropDraft, togglePause, lap, stop } = useOutingRecorder('sport-map:recording', fix)

// Position shared with the family on request, until the outing is saved or discarded.
const live = useLiveShare(null, fix)
watch(recording, (current) => {
  if (!current) live.stop()
})

function discardDraft() {
  if (window.confirm(t('record.discardDraftConfirm'))) dropDraft()
}

// Stopwatch
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 1000)))
onBeforeUnmount(() => clearInterval(clock))

const elapsedS = computed(() => (recording.value ? elapsedMs(recording.value, now.value) / 1000 : 0))
const track = computed(() => recording.value?.points.map(p => [p.lng, p.lat] as LngLat) ?? [])
const climb = computed(() => {
  const points = recording.value?.points ?? []
  if (points.length < 2 || points.some(p => p.alt === null)) return null
  return elevationStats(track.value, points.map(p => p.alt!))
})
const gainM = computed(() => climb.value?.gain ?? null)

const follow = ref(true)

// GPS gaps: the warning shows for a few seconds after each new gap, then leaves the map and the data screen
// clear (#180). The gaps of a resumed draft show nothing. The seconds only count while the page is visible:
// the Android app notices a gap with the screen off, and the rider should still see it when looking.
const GAP_ALERT_MS = 6000
const gapAlert = ref(false)
let gapAlertTimer: ReturnType<typeof setTimeout> | undefined
function hideGapAlertLater() {
  clearTimeout(gapAlertTimer)
  if (!document.hidden) gapAlertTimer = setTimeout(() => (gapAlert.value = false), GAP_ALERT_MS)
}
function onVisibilityChange() {
  if (gapAlert.value) hideGapAlertLater()
}
watch(() => recording.value?.gaps, (gaps, before) => {
  if (gaps == null || before == null || gaps <= before) return
  gapAlert.value = true
  hideGapAlertLater()
})
onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))
onBeforeUnmount(() => {
  clearTimeout(gapAlertTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

// Data screen
const dataView = ref(false)
const maxSpeedOf = maxSpeedTracker()
// Measured once per new point, not every second.
const maxSpeedMs = computed(() => (recording.value ? maxSpeedOf(recording.value.points) : null))
const liveStats = computed<MeasuredStats>(() => {
  const current = recording.value
  const lap = current ? currentLap(current, now.value) : null
  return {
    now: now.value,
    elapsedS: current ? elapsedS.value : null,
    movingS: current ? current.movingMs / 1000 : null,
    lapElapsedS: lap?.elapsedS ?? null,
    lapDistanceM: lap?.distanceM ?? null,
    distanceM: current?.distanceM ?? null,
    remainingM: null,
    gainM: gainM.value,
    remainingGainM: null,
    lossM: climb.value?.loss ?? null,
    // The latest GPS altitude, even standing still (no point is recorded then), from a fix precise enough
    // to be recorded.
    altitudeM: (fix.value && fix.value.accuracyM <= MAX_ACCURACY_M ? fix.value.altitudeM : null)
      ?? current?.points.at(-1)?.alt ?? null,
    speedMs: current && !paused.value ? currentSpeed(current.points, now.value) : null,
    averageSpeedMs: current ? averageSpeed(current.distanceM, current.movingMs) : null,
    maxSpeedMs: maxSpeedMs.value,
    arrivalAt: null,
    lapNumber: lap?.number ?? null,
  }
})

// End of the outing
const saving = ref(false)
const sportItems = useSportItems()
const finishOpen = ref(false)
const form = reactive<{ name: string, sport_type: SportType, is_public: boolean }>({
  name: '',
  sport_type: 'hiking',
  is_public: false,
})
// The member's default sport (#148) is preselected, hiking without one, unless they already picked another.
const defaultSport = usePreference('defaultSport')
watch(defaultSport, (sport, before) => {
  if (form.sport_type === (before ?? 'hiking')) form.sport_type = sport ?? 'hiking'
})

function openFinish() {
  if (!recording.value || recording.value.points.length < 2) {
    toast.add({ title: t('record.noTrack'), description: t('record.noTrackHint'), color: 'warning' })
    return
  }
  form.name = t('record.defaultName', { date: formatDate(new Date(recording.value.startedAt).toISOString()) })
  finishOpen.value = true
}

async function save() {
  const current = recording.value!
  const trackPayload = recordingTrack(current)!
  const body: RecordingPayload = {
    route: { ...form, description: '', source: 'recorded', ...trackPayload },
    ...outingTimes(current, Date.now()),
    track: outingTrack(current) ?? undefined,
  }
  saving.value = true
  try {
    const { id } = await $fetch<{ id: string }>('/api/recordings', { method: 'POST', body })
    stop()
    toast.add({ title: t('record.saved'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo(`/routes/${id}`)
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

function discard() {
  if (!window.confirm(t('record.discardConfirm'))) return
  stop()
  finishOpen.value = false
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteFollow v-model:follow="follow" recording :coordinates="track" :fix="fix" :covered="dataView && !!recording" />
      </ClientOnly>

      <!-- Over the map, which keeps following the position; the top bar stays above it. -->
      <LiveData v-if="dataView && recording" class="absolute inset-0 z-10 pt-16" mode="record" :stats="liveStats" :default-pace="false" @lap="lap" />

      <!-- Right padding: the map controls stay reachable. -->
      <div class="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 p-3" :class="dataView && recording ? 'pr-3' : 'pr-14'">
        <div class="pointer-events-auto flex items-center gap-2">
          <UButton to="/" icon="i-lucide-x" :label="t('record.quit')" color="neutral" variant="solid" class="shadow-md" />
          <!-- Icon only on phones: with the label, the bar overflowed a 360 px screen. -->
          <UBadge v-if="recording && !paused" icon="i-lucide-circle-dot" :label="t('record.recording')" color="error" variant="solid" :ui="{ label: 'max-sm:sr-only' }" />
          <UBadge v-else-if="paused" icon="i-lucide-pause" :label="t('record.paused')" color="neutral" variant="solid" :ui="{ label: 'max-sm:sr-only' }" />
          <OutdoorReadabilityToggle class="ml-auto" />
          <UButton
            v-if="recording"
            :icon="dataView ? 'i-lucide-map' : 'i-lucide-gauge'"
            :label="dataView ? t('liveData.showMap') : t('liveData.showData')"
            :ui="{ label: 'outdoor:max-sm:sr-only' }"
            color="neutral"
            variant="solid"
            class="shrink-0 shadow-md"
            @click="dataView = !dataView"
          />
        </div>
        <UAlert v-if="gpsError" class="pointer-events-auto" color="warning" icon="i-lucide-map-pin-off" :title="gpsError" />
        <UAlert
          v-else-if="gapAlert && recording"
          class="pointer-events-auto"
          color="warning"
          icon="i-lucide-satellite-dish"
          :title="t('record.gaps', recording.gaps)"
          :description="t('record.gapsHint')"
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

    <div class="shrink-0 space-y-3 border-t border-default bg-default p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <template v-if="recording">
        <div v-if="!dataView" class="grid grid-cols-4 gap-2 text-center" aria-live="off">
          <div>
            <p class="text-xs text-muted">{{ t('duration.short') }}</p>
            <p class="font-numbers text-lg font-semibold whitespace-nowrap tabular-nums sm:text-xl" data-testid="elapsed">{{ formatStopwatch(elapsedS) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">{{ t('route.distance') }}</p>
            <p class="font-numbers text-lg font-semibold whitespace-nowrap tabular-nums sm:text-xl" data-testid="distance">{{ formatDistance(recording.distanceM) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">{{ t('record.speed') }}</p>
            <p class="font-numbers text-lg font-semibold whitespace-nowrap tabular-nums sm:text-xl">{{ formatSpeed(recording.distanceM, recording.movingMs / 1000) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">{{ t('record.gain') }}</p>
            <p class="font-numbers text-lg font-semibold whitespace-nowrap tabular-nums sm:text-xl">{{ gainM != null ? `${Math.round(gainM)} m` : '—' }}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
            :label="paused ? t('record.resume') : t('record.pause')"
            color="neutral"
            variant="outline"
            size="lg"
            block
            @click="togglePause"
          />
          <UButton icon="i-lucide-square" :label="t('record.finish')" size="lg" block @click="openFinish" />
        </div>
        <LiveShareControl
          :active="live.active.value"
          :starting="live.starting.value"
          :last-sent-at="live.lastSentAt.value"
          :waiting="live.waiting.value"
          :now="now"
          @start="live.start"
          @stop="live.stop"
        />
      </template>

      <div v-else-if="draft" class="space-y-2">
        <p class="text-sm">
          {{ t('record.draft', { date: formatDate(new Date(draft.startedAt).toISOString()), distance: formatDistance(draft.distanceM) }) }}
        </p>
        <div class="grid grid-cols-2 gap-2">
          <UButton :label="t('record.discard')" color="neutral" variant="outline" block @click="discardDraft" />
          <UButton icon="i-lucide-play" :label="t('record.resume')" block @click="resumeDraft" />
        </div>
      </div>

      <template v-else>
        <UButton icon="i-lucide-circle-dot" :label="t('record.start')" size="xl" block @click="start" />
        <p class="text-sm text-muted">
          {{ background ? t('record.screenOffOk') : t('record.keepOpen') }}
        </p>
      </template>

      <p class="flex flex-wrap justify-between gap-x-3 text-xs text-muted">
        <span>
          <UIcon name="i-lucide-satellite" class="mr-1 align-text-bottom" />
          {{ fix ? t('follow.accuracy', { accuracy: Math.round(fix.accuracyM) }) : t('follow.searchingGps') }}
        </span>
        <span v-if="background"><UIcon name="i-lucide-moon" class="mr-1 align-text-bottom" />{{ t('follow.backgroundGps') }}</span>
        <span v-else-if="screenKeptOn"><UIcon name="i-lucide-sun" class="mr-1 align-text-bottom" />{{ t('follow.screenOn') }}</span>
        <span v-else-if="!wakeLockSupported">
          <UIcon name="i-lucide-sun-dim" class="mr-1 align-text-bottom" />{{ t('record.keepScreenOn') }}
        </span>
      </p>
    </div>

    <UModal v-model:open="finishOpen" :title="t('record.finishTitle')" :description="t('record.finishDescription')">
      <template #body>
        <UForm :schema="routeDetailsSchemaLocalized" :state="form" class="space-y-4" @submit="save">
          <UFormField :label="t('collections.name')" name="name" required>
            <UInput id="recording-name" v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField :label="t('filters.sport')" name="sport_type">
            <USelect id="recording-sport" v-model="form.sport_type" :items="sportItems" class="w-full" />
          </UFormField>
          <UFormField name="is_public">
            <USwitch v-model="form.is_public" :label="t('editor.public')" :description="t('editor.publicHint')" />
          </UFormField>
          <div class="flex justify-between gap-2">
            <UButton :label="t('record.discardOuting')" color="error" variant="ghost" @click="discard" />
            <UButton type="submit" :label="t('common.save')" icon="i-lucide-save" :loading="saving" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
