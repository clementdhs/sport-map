import type { CoachGoal } from '#shared/types/account'
import type { MyProfile } from '#shared/types/routes'
import { DEFAULT_PACES } from '#shared/utils/routes'
import { DEFAULT_SESSION_DURATION, type SessionChoice, sessionOn } from '#shared/utils/coachSessions'
import type { LoadOuting } from '#shared/utils/trainingForm'
import type { CoachChoice } from '~/utils/coachChoice'

// The coach's session of the day (#264) away from the coach page, for the route of the session (#266): from the
// profile's outings, the goal and the duration and « Autre séance » clicks the coach page last showed today
// (coachChoice.ts), like the review after an outing (#267). For the day chosen there (#279), today without one.
// Loaded on demand, in the browser.
export function useSessionOfTheDay() {
  const paces = usePreference('paces')
  const status = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const outings = shallowRef<LoadOuting[]>([])
  const goal = shallowRef<CoachGoal | null>(null)
  // The session's day, a French local date: read again on each load, the coach page may have changed it
  const day = ref(localDate(new Date()))
  const coachChoice = ref<CoachChoice>({ minutes: DEFAULT_SESSION_DURATION, other: 0 })

  async function load() {
    if (status.value === 'loading' || status.value === 'ready') return
    status.value = 'loading'
    day.value = loadCoachDay()
    coachChoice.value = loadCoachChoice(day.value)
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
    return sessionOn(outings.value, {
      goal: goal.value,
      minutes: coachChoice.value.minutes,
      easyPace: paces.value.running ?? DEFAULT_PACES.running,
    }, day.value, coachChoice.value.other)
  })

  // « Autre séance », kept for the coach page and the review like a click there.
  function other() {
    coachChoice.value = { ...coachChoice.value, other: coachChoice.value.other + 1 }
    saveCoachChoice(coachChoice.value, day.value)
  }

  return { status, choice, minutes: computed(() => coachChoice.value.minutes), day, load, other }
}
