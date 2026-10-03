import type { SportType } from '#shared/utils/routes'
import type { Announcement, VoicePrefs } from '~/utils/voiceGuide'

const PREFS_KEY = 'sport-map:voice'

// Voice guidance of follow mode: the choices kept on the device, and the announcements of voiceGuide.ts read
// out in the interface's language. Running and hiking hear the pace of each kilometre, cycling the average
// speed.
export function useVoiceGuide(sport: () => SportType) {
  const { t } = useI18n()
  const { locale, formatNumber } = useFormat()

  const prefs = ref<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const supported = ref(false)
  onMounted(() => {
    supported.value = speechSupported()
    try {
      prefs.value = parseVoicePrefs(localStorage.getItem(PREFS_KEY))
    }
    catch { /* storage blocked: the defaults */ }
  })
  onBeforeUnmount(stopSpeaking)

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

  function duration(seconds: number) {
    const parts = durationParts(seconds)
    return [
      parts.hours && t('voice.said.hours', { n: parts.hours }, parts.hours),
      parts.minutes && t('voice.said.minutes', { n: parts.minutes }, parts.minutes),
      parts.seconds && t('voice.said.seconds', { n: parts.seconds }, parts.seconds),
    ].filter(Boolean).join(' ') || t('voice.said.seconds', { n: 0 }, 0)
  }

  function length(meters: number) {
    if (meters < 1000) {
      const rounded = Math.round(meters / 50) * 50
      return t('voice.said.metres', { n: formatNumber(rounded) }, rounded)
    }
    const km = Math.round(meters / 100) / 10
    return t('voice.said.kilometres', { n: formatNumber(km, { maximumFractionDigits: 1 }) }, km)
  }

  function sentence(announcement: Announcement): string {
    switch (announcement.kind) {
      case 'offTrack': return t('voice.said.offTrack')
      case 'backOnTrack': return t('voice.said.backOnTrack')
      case 'arrived': return t('voice.said.arrived')
      case 'climb': return t('voice.said.climb', {
        length: length(announcement.lengthM),
        grade: formatNumber(Math.round(announcement.grade)),
        distance: length(announcement.inM),
      })
      case 'kilometre': {
        const said = [t('voice.said.kilometre', { km: announcement.km, time: duration(announcement.elapsedS) })]
        if (sport() !== 'cycling') said.push(t('voice.said.pace', { pace: duration(announcement.splitS) }))
        else if (announcement.averageSpeedMs !== null) {
          said.push(t('voice.said.averageSpeed', { speed: formatNumber(announcement.averageSpeedMs * 3.6, { maximumFractionDigits: 1 }) }))
        }
        return said.join(' ')
      }
    }
  }

  function announce(announcements: Announcement[]) {
    if (!prefs.value.enabled) return
    for (const announcement of announcements) {
      if (prefs.value.announcements.includes(announcementSetting(announcement))) speak(sentence(announcement), locale())
    }
  }

  return { prefs, setPrefs, supported, announce }
}
