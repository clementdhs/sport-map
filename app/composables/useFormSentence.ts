import type { FormSummary } from '#shared/utils/trainingForm'

// The sentence on the last 7 days of the form card and detail page (#263): their load against the baseline, then
// what to do about it. Empty while the coach is still learning.
export function useFormSentence(form: MaybeRefOrGetter<FormSummary>) {
  const { t } = useI18n()
  const { formatNumber } = useFormat()
  return computed(() => {
    const { ratio, load, baseline, state } = toValue(form)
    if (ratio === null || baseline === null || state === 'learning') return ''
    const percent = Math.round((ratio - 1) * 100)
    const comparison = Math.abs(percent) < 5
      ? t('coachForm.comparison.same')
      : t(`coachForm.comparison.${percent > 0 ? 'more' : 'less'}`, { percent: Math.abs(percent) })
    const summary = t('coachForm.summary', {
      load: formatNumber(Math.round(load)),
      comparison,
      baseline: formatNumber(Math.round(baseline)),
    })
    return `${summary} ${t(`coachForm.advice.${state}`)}`
  })
}
