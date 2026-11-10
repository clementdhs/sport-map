import type { CoachGoal } from '#shared/types/account'
import type { MyProfile } from '#shared/types/routes'
import { DEFAULT_PACES } from '#shared/utils/routes'
import { DEFAULT_SESSION_DURATION, outingDaysBefore, type SessionChoice, sessionOfTheDay } from '#shared/utils/coachSessions'
import type { LoadOuting } from '#shared/utils/trainingForm'
import type { CoachChoice } from '~/utils/coachChoice'

// The coach's session of the day (#264) away from the coach page, for the route of the session (#266): from the
// profile's outings, the goal and the duration and « Autre séance » clicks the coach page last showed today
// (coachChoice.ts), like the review after an outing (#267). Loaded on demand, in the browser.
export function useSessionOfTheDay() {
  const paces = usePreference('paces')
  const status = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const outings = shallowRef<LoadOuting[]>([])
  const goal = shallowRef<CoachGoal | null>(null)
  const today = localDate(new Date())
  const coachChoice = ref<CoachChoice>({ minutes: DEFAULT_SESSION_DURATION, other: 0 })

  async function load() {
    if (status.value === 'loading' || status.value === 'ready') return
    status.value = 'loading'
    coachChoice.value = loadCoachChoice(today)
    try {
      const [profile, savedGoal] = await Promise.all([
        $fetch<MyProfile>('/api/profile/me'),
        // Without a goal (none chosen, or an error) the coach aims at progress, as on the coach page.
        $fetch<CoachGoal | null>('/api/profile/me/coach-goal').catch(() => null),
      ])
      outings.value = profile.outings
      goal.value = savedGoal ?? null
      status.value = 'ready'
    }
    catch {
      status.value = 'failed'
    }
  }

  const choice = computed<SessionChoice | null>(() => {
    if (status.value !== 'ready') return null
    const form = trainingForm(outings.value)
    return sessionOfTheDay({
      state: form.state,
      ratio: form.ratio,
      goal: goal.value,
      minutes: coachChoice.value.minutes,
      outingDays: outingDaysBefore(outings.value, form.historyDays),
      easyPace: paces.value.running ?? DEFAULT_PACES.running,
      today,
    }, coachChoice.value.other)
  })

  // « Autre séance », kept for the coach page and the review like a click there.
  function other() {
    coachChoice.value = { ...coachChoice.value, other: coachChoice.value.other + 1 }
    saveCoachChoice(coachChoice.value, today)
  }

  return { status, choice, minutes: computed(() => coachChoice.value.minutes), today, load, other }
}
