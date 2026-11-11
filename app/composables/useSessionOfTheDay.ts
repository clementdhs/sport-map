import type { CoachGoal } from '#shared/types/account'
import type { MyProfile, RecordOuting } from '#shared/types/routes'
import { coachPace } from '#shared/utils/coachPace'
import { daySession, defaultMinutes } from '#shared/utils/coachPlan'
import type { SessionChoice } from '#shared/utils/coachSessions'
import type { CoachChoice } from '~/utils/coachChoice'

// The coach's session of the day (#264) away from the coach page, for the route of the session (#266): from the
// profile's outings, the goal and the duration and « Autre séance » clicks the coach page last showed today
// (coachChoice.ts), like the review after an outing (#267). For the day chosen there (#279), today without one.
// Loaded on demand, in the browser.
export function useSessionOfTheDay() {
  const paces = usePreference('paces')
  const status = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const outings = shallowRef<RecordOuting[]>([])
  const goal = shallowRef<CoachGoal | null>(null)
  // The session's day, a French local date: read again on each load, the coach page may have changed it
  const day = ref(localDate(new Date()))
  // The choice kept for the day, null until the member picks one (the plan's default then)
  const coachChoice = ref<CoachChoice | null>(null)

  async function load() {
    if (status.value === 'loading' || status.value === 'ready') return
    status.value = 'loading'
    day.value = loadCoachDay()
    coachChoice.value = savedCoachChoice(day.value)
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

  // The day's session in the week plan (#285), as the coach page shows it
  const choice = computed<SessionChoice | null>(() => {
    if (status.value !== 'ready') return null
    return daySession(outings.value, {
      goal: goal.value,
      easyPace: coachPace(outings.value, paces.value.running).pace,
      choiceOf: date => (date === day.value ? coachChoice.value : savedCoachChoice(date)),
    }, day.value)
  })

  // « Autre séance », kept for the coach page and the review like a click there.
  function other() {
    const minutes = coachChoice.value?.minutes ?? defaultMinutes(goal.value, day.value)
    coachChoice.value = { minutes, other: (coachChoice.value?.other ?? 0) + 1 }
    saveCoachChoice(coachChoice.value, day.value)
  }

  return { status, choice, minutes: computed(() => choice.value?.plan.minutes ?? defaultMinutes(goal.value, day.value)), day, load, other }
}
