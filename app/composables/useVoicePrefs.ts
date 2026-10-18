import type { VoicePrefs } from '~/utils/voiceGuide'

const PREFS_KEY = 'sport-map:voice'

// Voice guidance choices, kept on the device: set in follow mode or on the settings page. `supported` stays
// false until mounted (the server can't tell).
export function useVoicePrefs() {
  const { t } = useI18n()
  const { locale } = useFormat()

  const prefs = ref<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const supported = ref(false)
  onMounted(() => {
    supported.value = speechSupported()
    try {
      prefs.value = parseVoicePrefs(localStorage.getItem(PREFS_KEY))
    }
    catch { /* storage blocked: the defaults */ }
  })

  function setPrefs(next: VoicePrefs) {
    const turnedOn = next.enabled && !prefs.value.enabled
    prefs.value = next
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    }
    catch { /* storage full or blocked: kept until the page closes */ }
    // Also lets the browser speak later: it only allows it after a user action.
    if (turnedOn) speak(t('voice.said.on'), locale())
  }

  return { prefs, supported, setPrefs }
}
