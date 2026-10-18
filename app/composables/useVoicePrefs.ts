import type { VoicePrefs } from '~/utils/voiceGuide'

// Voice guidance choices, kept in the member's account: set in follow mode or on the settings page. `supported`
// stays false until mounted (the server can't tell).
export function useVoicePrefs() {
  const { t } = useI18n()
  const { locale } = useFormat()

  const prefs = usePreference('voice')
  const supported = ref(false)
  onMounted(() => {
    supported.value = speechSupported()
  })

  function setPrefs(next: VoicePrefs) {
    const turnedOn = next.enabled && !prefs.value.enabled
    prefs.value = next
    // Also lets the browser speak later: it only allows it after a user action.
    if (turnedOn) speak(t('voice.said.on'), locale())
  }

  return { prefs, supported, setPrefs }
}
