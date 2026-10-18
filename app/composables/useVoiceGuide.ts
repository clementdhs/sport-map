import type { SportType } from '#shared/utils/routes'
import type { Announcement } from '~/utils/voiceGuide'

// Voice guidance of follow mode: the choices kept on the device (useVoicePrefs), and the announcements of
// voiceGuide.ts read out in the interface's language. Runners and hikers hear the pace of each kilometre,
// cyclists the average speed.
export function useVoiceGuide(sport: () => SportType) {
  const { t } = useI18n()
  const { locale, formatNumber } = useFormat()

  const { prefs, supported, setPrefs } = useVoicePrefs()
  onBeforeUnmount(stopSpeaking)

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
        if (SPORT_KINDS[sport()] !== 'ride') said.push(t('voice.said.pace', { pace: duration(announcement.splitS) }))
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
