import type { MaybeRefOrGetter } from 'vue'
import type { SessionPlan } from '#shared/utils/coachSessions'

// The written outline of a session of the day (#264): the labels under its strip ("Échauffement · 5 × 3 min en
// côte · Retour au calme") and the whole sentence for screen readers and the session route's panel (#266).
export function useSessionOutline(source: MaybeRefOrGetter<SessionPlan>) {
  const { t } = useI18n()
  const { formatNumber } = useFormat()
  const minutesText = (value: number) => (value < 1 ? `${Math.round(value * 60)} s` : `${formatNumber(value)} min`)

  return computed(() => {
    const { blocks, reps, kind } = toValue(source)
    if (!reps) {
      const middle = t(`coachSession.blocks.${kind === 'longHilly' ? 'hilly' : kind === 'recovery' ? 'recovery' : 'easy'}`)
      return { start: null, middle, end: null, summary: middle }
    }
    const values = { count: reps.count, effort: minutesText(reps.effortMin), recovery: minutesText(reps.recoveryMin) }
    return {
      start: t('coachSession.blocks.warmup'),
      middle: t(`coachSession.blocks.${reps.hill ? 'hills' : 'fast'}`, values),
      end: t('coachSession.blocks.cooldown'),
      summary: t('coachSession.blocks.summary', {
        warmup: minutesText(blocks[0]!.minutes),
        reps: t(`coachSession.blocks.${reps.hill ? 'hillsDetail' : 'fastDetail'}`, values),
        cooldown: minutesText(blocks.at(-1)!.minutes),
      }),
    }
  })
}
