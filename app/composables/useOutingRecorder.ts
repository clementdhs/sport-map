import type { GpsFix } from './useWatchPosition'
import type { Recording } from '~/utils/recorder'

// An outing recorded with the GPS fixes it is given, for /record and follow mode. A web page only gets
// positions while the screen is on: the recording is saved on the phone (under draftKey) after every point, so
// that it can be resumed if the page closes, and leaving the page asks first.
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

  function update(next: Recording) {
    if (next === recording.value) return
    recording.value = next
    saveDraft(next)
  }

  function accept(current: GpsFix) {
    if (recording.value) update(addFix(recording.value, current, Date.now()))
  }
  watch(fix, (current) => {
    if (current) accept(current)
  })

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
    clearDraft()
    draft.value = null
  }

  const paused = computed(() => recording.value?.pausedAt != null)
  function togglePause() {
    if (!recording.value) return
    update(paused.value ? resumeRecording(recording.value) : pauseRecording(recording.value, Date.now()))
  }

  // Once the outing is saved or discarded.
  function stop() {
    clearDraft()
    recording.value = null
  }

  // Leaving keeps the recording on the phone; warn anyway, a closed page records nothing.
  onBeforeRouteLeave(() => {
    if (recording.value) return window.confirm(t('record.leaveConfirm'))
  })
  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (recording.value) event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

  return { recording, draft, paused, start, resumeDraft, discardDraft, togglePause, stop }
}
