import type { MaybeRefOrGetter } from 'vue'
import type { SportType } from '#shared/utils/routes'

// How a route's estimated duration is computed, for its tooltip: the member's pace for the sport (#146), else
// the sport's default one, and a word when the gain is unknown.
export function useDurationMethod(sport: MaybeRefOrGetter<SportType>, elevationGainM: MaybeRefOrGetter<number | null>) {
  const { t } = useI18n()
  const { locale } = useFormat()
  const paces = usePreference('paces')
  return computed(() => {
    const type = toValue(sport)
    const pace = paces.value[type]
    const formula = pace === undefined
      ? t(`duration.methods.${type}`)
      : t(`duration.myMethods.${type}`, { value: formatPaceSetting(type, pace, locale()) })
    return toValue(elevationGainM) === null ? `${formula} ${t('duration.unknownGain')}` : formula
  })
}
