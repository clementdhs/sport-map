import type { GpsFix } from './useWatchPosition'
import type { Recording } from '~/utils/recorder'

// How often an ongoing recording is written to the phone. Writing the whole outing after every point cost more
// and more battery as it grew (about 1.5 MB of JSON per second after 100 km, #182).
export const DRAFT_SAVE_MS = 15_000

// An outing recorded with the GPS fixes it is given, for /record and follow mode. A web page only gets
// positions while the screen is on: the recording is saved on the phone (under draftKey) at most every
// DRAFT_SAVE_MS, at once on start and pause, and when the page is hidden or left, so that it can be resumed if the
// page closes; leaving the page asks first.
export function useOutingRecorder(draftKey: string, fix: Ref<GpsFix | null>) {
  const { t } = useI18n()

  // Browser storage may be unavailable: then the recording is just not kept.
  function loadDraft(): Recording | null {
    try {
      const raw = localStorage.getItem(draftKey)
      return raw ? JSON.parse(raw) as Recording : null
    }
    catch {
      return null
    }
  }
  function saveDraft(recording: Recording) {
    try {
      localStorage.setItem(draftKey, JSON.stringify(recording))
    }
    catch { /* storage full or blocked */ }
  }
  function clearDraft() {
    try {
      localStorage.removeItem(draftKey)
    }
    catch { /* storage blocked */ }
  }

  const recording = shallowRef<Recording | null>(null)
  // An unfinished recording found on the phone, until resumed or discarded.
  const draft = shallowRef<Recording | null>(null)
  onMounted(() => (draft.value = loadDraft()))

  // Changes not written yet are written by a timer, at most DRAFT_SAVE_MS after the last write.
  let savedAt = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  function persist() {
    clearTimeout(saveTimer)
    saveTimer = undefined
    if (!recording.value) return
    saveDraft(recording.value)
    savedAt = Date.now()
  }
  function flush() {
    if (saveTimer) persist()
  }

  function update(next: Recording, now = false) {
    if (next === recording.value) return
    recording.value = next
    if (now) persist()
    else if (!saveTimer) saveTimer = setTimeout(persist, Math.max(0, savedAt + DRAFT_SAVE_MS - Date.now()))
  }

  function accept(current: GpsFix) {
    if (recording.value) update(addFix(recording.value, current, Date.now()))
  }
  watch(fix, (current) => {
    if (current) accept(current)
  })

  function start() {
    recording.value = startRecording(Date.now())
    persist()
    if (fix.value) accept(fix.value)
  }

  function resumeDraft() {
    recording.value = draft.value
    draft.value = null
  }

  function discardDraft() {
    clearDraft()
    draft.value = null
  }

  const paused = computed(() => recording.value?.pausedAt != null)
  function togglePause() {
    if (!recording.value) return
    update(paused.value ? resumeRecording(recording.value) : pauseRecording(recording.value, Date.now()), true)
  }

  // Once the outing is saved or discarded.
  function stop() {
    clearTimeout(saveTimer)
    saveTimer = undefined
    clearDraft()
    recording.value = null
  }

  // Leaving keeps the recording on the phone; warn anyway, a closed page records nothing.
  onBeforeRouteLeave(() => {
    if (recording.value) return window.confirm(t('record.leaveConfirm'))
  })
  function onBeforeUnload(event: BeforeUnloadEvent) {
    flush()
    if (recording.value) event.preventDefault()
  }
  // The page may be closed or killed once hidden (screen off, another app): write what is not written yet.
  function onVisibilityChange() {
    if (document.hidden) flush()
  }
  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })
  onBeforeUnmount(() => {
    flush()
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { recording, draft, paused, start, resumeDraft, discardDraft, togglePause, stop }
}
