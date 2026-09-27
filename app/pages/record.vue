<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { LngLat, RecordingPayload, SportType } from '#shared/utils/routes'
import type { GpsFix } from '~/composables/useWatchPosition'
import type { Recording } from '~/utils/recorder'

// Records an outing with the phone's GPS, then saves it as a new route marked as done. A web page only gets
// positions while the screen is on: the screen is kept on, and the recording is saved on the phone after
// every point, so that it can be resumed if the page closes.
definePageMeta({ layout: false, middleware: 'auth' })
useSeoMeta({ title: 'Enregistrer une sortie — sport-map' })

const toast = useToast()
const { fix, error: gpsError } = useWatchPosition()
const { active: screenKeptOn, supported: wakeLockSupported } = useScreenWakeLock()

// Local copy of the recording in progress (browser storage may be unavailable: then it's just not kept).
const DRAFT_KEY = 'sport-map:recording'
function loadDraft(): Recording | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) as Recording : null
  }
  catch {
    return null
  }
}
function saveDraft(recording: Recording) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(recording))
  }
  catch { /* storage full or blocked */ }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  }
  catch { /* storage blocked */ }
}

const recording = shallowRef<Recording | null>(null)
// An unfinished recording found on the phone, until resumed or discarded.
const draft = shallowRef<Recording | null>(null)

function update(next: Recording) {
  if (next === recording.value) return
  recording.value = next
  saveDraft(next)
}

function accept(current: GpsFix) {
  if (recording.value) update(addFix(recording.value, current, Date.now()))
}

function start() {
  recording.value = startRecording(Date.now())
  saveDraft(recording.value)
  if (fix.value) accept(fix.value)
}

function resumeDraft() {
  recording.value = draft.value
  draft.value = null
}

function discardDraft() {
  if (!window.confirm('Abandonner la sortie commencée ? Sa trace sera perdue.')) return
  clearDraft()
  draft.value = null
}

watch(fix, (current) => {
  if (current) accept(current)
})

const paused = computed(() => recording.value?.pausedAt != null)
function togglePause() {
  if (!recording.value) return
  update(paused.value ? resumeRecording(recording.value) : pauseRecording(recording.value, Date.now()))
}

// Stopwatch
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  draft.value = loadDraft()
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(clock))

const elapsedS = computed(() => (recording.value ? elapsedMs(recording.value, now.value) / 1000 : 0))
const track = computed(() => recording.value?.points.map(p => [p.lng, p.lat] as LngLat) ?? [])
const gainM = computed(() => {
  const points = recording.value?.points ?? []
  if (points.length < 2 || points.some(p => p.alt === null)) return null
  return elevationStats(track.value, points.map(p => p.alt!)).gain
})

const follow = ref(true)

// Leaving keeps the recording on the phone; warn anyway, a closed page records nothing.
const saving = ref(false)
onBeforeRouteLeave(() => {
  if (recording.value && !saving.value) {
    return window.confirm('La sortie est en cours. Tu pourras la reprendre en revenant sur cette page. Quitter ?')
  }
})
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (recording.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// End of the outing
const sportItems = SPORT_TYPES.map(value => ({ value, label: SPORT_LABELS[value], icon: SPORT_ICONS[value] }))
const finishOpen = ref(false)
const form = reactive<{ name: string, sport_type: SportType, is_public: boolean }>({
  name: '',
  sport_type: 'hiking',
  is_public: false,
})

function openFinish() {
  if (!recording.value || recording.value.points.length < 2) {
    toast.add({ title: 'Pas encore de trace', description: 'Marche un peu : la trace démarre quand le GPS est assez précis.', color: 'warning' })
    return
  }
  form.name = `Sortie du ${formatDate(new Date(recording.value.startedAt).toISOString())}`
  finishOpen.value = true
}

async function save() {
  const current = recording.value!
  const trackPayload = recordingTrack(current)!
  const durationS = Math.round((Date.now() - current.startedAt) / 1000)
  const body: RecordingPayload = {
    route: { ...form, description: '', source: 'recorded', ...trackPayload },
    started_at: new Date(current.startedAt).toISOString(),
    duration_s: durationS,
    moving_s: Math.min(Math.round(current.movingMs / 1000), durationS),
  }
  saving.value = true
  try {
    const { id } = await $fetch<{ id: string }>('/api/recordings', { method: 'POST', body })
    clearDraft()
    recording.value = null
    toast.add({ title: 'Sortie enregistrée', color: 'success', icon: 'i-lucide-check' })
    await navigateTo(`/routes/${id}`)
  }
  catch (error) {
    toast.add({
      title: "Impossible d'enregistrer la sortie",
      description: `${(error as FetchError).data?.statusMessage ?? (error as Error).message}. Elle reste gardée sur ton téléphone : réessaie.`,
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

function discard() {
  if (!window.confirm('Abandonner cette sortie ? Sa trace sera perdue.')) return
  clearDraft()
  recording.value = null
  finishOpen.value = false
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteFollow recording :coordinates="track" :fix="fix" :follow="follow" @stop-follow="follow = false" />
      </ClientOnly>

      <!-- Right padding: the map controls stay reachable. -->
      <div class="pointer-events-none absolute inset-x-0 top-0 space-y-2 p-3 pr-14">
        <div class="pointer-events-auto flex items-center gap-2">
          <UButton to="/" icon="i-lucide-x" label="Quitter" color="neutral" variant="solid" class="shadow-md" />
          <UBadge v-if="recording && !paused" icon="i-lucide-circle-dot" label="Enregistrement" color="error" variant="solid" />
          <UBadge v-else-if="paused" icon="i-lucide-pause" label="En pause" color="neutral" variant="solid" />
        </div>
        <UAlert v-if="gpsError" class="pointer-events-auto" color="warning" icon="i-lucide-map-pin-off" :title="gpsError" />
        <UAlert
          v-else-if="recording?.gaps"
          class="pointer-events-auto"
          color="warning"
          icon="i-lucide-satellite-dish"
          :title="`GPS interrompu ${recording.gaps} fois`"
          description="L'écran s'est sans doute éteint : la trace est reliée en ligne droite sur ces passages."
        />
      </div>

      <UButton
        v-if="!follow && fix"
        icon="i-lucide-locate-fixed"
        label="Recentrer"
        color="neutral"
        variant="solid"
        class="absolute right-3 bottom-10 shadow-md"
        @click="follow = true"
      />
    </div>

    <div class="shrink-0 space-y-3 border-t border-default bg-default p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <template v-if="recording">
        <div class="grid grid-cols-4 gap-2 text-center" aria-live="off">
          <div>
            <p class="text-xs text-muted">Durée</p>
            <p class="text-base font-semibold whitespace-nowrap sm:text-lg tabular-nums" data-testid="elapsed">{{ formatStopwatch(elapsedS) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Distance</p>
            <p class="text-base font-semibold whitespace-nowrap sm:text-lg" data-testid="distance">{{ formatDistance(recording.distanceM) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Vitesse</p>
            <p class="text-base font-semibold whitespace-nowrap sm:text-lg">{{ formatSpeed(recording.distanceM, recording.movingMs / 1000) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">D+</p>
            <p class="text-base font-semibold whitespace-nowrap sm:text-lg">{{ gainM != null ? `${Math.round(gainM)} m` : '—' }}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
            :label="paused ? 'Reprendre' : 'Pause'"
            color="neutral"
            variant="outline"
            size="lg"
            block
            @click="togglePause"
          />
          <UButton icon="i-lucide-square" label="Terminer" size="lg" block @click="openFinish" />
        </div>
      </template>

      <div v-else-if="draft" class="space-y-2">
        <p class="text-sm">
          Une sortie commencée le {{ formatDate(new Date(draft.startedAt).toISOString()) }}
          ({{ formatDistance(draft.distanceM) }}) n'est pas terminée.
        </p>
        <div class="grid grid-cols-2 gap-2">
          <UButton label="Abandonner" color="neutral" variant="outline" block @click="discardDraft" />
          <UButton icon="i-lucide-play" label="Reprendre" block @click="resumeDraft" />
        </div>
      </div>

      <template v-else>
        <UButton icon="i-lucide-circle-dot" label="Démarrer" size="xl" block @click="start" />
        <p class="text-sm text-muted">
          Garde cette page ouverte pendant ta sortie : un navigateur ne suit pas la position écran éteint.
        </p>
      </template>

      <p class="flex flex-wrap justify-between gap-x-3 text-xs text-muted">
        <span>
          <UIcon name="i-lucide-satellite" class="mr-1 align-text-bottom" />
          {{ fix ? `Précision GPS : ± ${Math.round(fix.accuracyM)} m` : 'Recherche du signal GPS…' }}
        </span>
        <span v-if="screenKeptOn"><UIcon name="i-lucide-sun" class="mr-1 align-text-bottom" />Écran maintenu allumé</span>
        <span v-else-if="!wakeLockSupported">
          <UIcon name="i-lucide-sun-dim" class="mr-1 align-text-bottom" />Garde l'écran allumé pendant la sortie
        </span>
      </p>
    </div>

    <UModal v-model:open="finishOpen" title="Terminer la sortie" description="Elle devient un parcours de ton profil, marqué comme réalisé.">
      <template #body>
        <UForm :schema="routeDetailsSchema" :state="form" class="space-y-4" @submit="save">
          <UFormField label="Nom" name="name" required>
            <UInput id="recording-name" v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="Sport" name="sport_type">
            <USelect id="recording-sport" v-model="form.sport_type" :items="sportItems" class="w-full" />
          </UFormField>
          <UFormField name="is_public">
            <USwitch v-model="form.is_public" label="Parcours public" description="Visible par tous et dans la recherche." />
          </UFormField>
          <div class="flex justify-between gap-2">
            <UButton label="Abandonner la sortie" color="error" variant="ghost" @click="discard" />
            <UButton type="submit" label="Enregistrer" icon="i-lucide-save" :loading="saving" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
