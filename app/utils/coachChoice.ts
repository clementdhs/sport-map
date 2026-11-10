import { DEFAULT_SESSION_DURATION, SESSION_DURATIONS, type SessionDuration } from '#shared/utils/coachSessions'

// What the coach page showed today (#267): the duration and the clicks on « Autre séance » of the session of the
// day (#264), kept in this browser for the day, so the coach page shows them again and the review after an outing
// finds the same session.
// And the outings the member said weren't the session of the day. Nothing on the server: the session of the day
// is worked out again from the outings each time, and a session is only matched with an outing of the same day.
const CHOICE_KEY = 'sport-map:coach-choice'
const DETACHED_KEY = 'sport-map:coach-detached'
// The latest outings detached are enough: only today's can be the session of the day.
const MAX_DETACHED = 20

export type CoachChoice = { minutes: SessionDuration, other: number }

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  }
  catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  }
  catch {
    // Private browsing or storage full: the review then proposes the session of the default duration.
  }
}

export function saveCoachChoice(choice: CoachChoice, today: string) {
  write(CHOICE_KEY, { ...choice, date: today })
}

// Today's choice, else the session of the day with the default duration.
export function loadCoachChoice(today: string): CoachChoice {
  const saved = read<CoachChoice & { date: string }>(CHOICE_KEY)
  if (saved?.date === today && SESSION_DURATIONS.includes(saved.minutes) && Number.isInteger(saved.other) && saved.other >= 0) {
    return { minutes: saved.minutes, other: saved.other }
  }
  return { minutes: DEFAULT_SESSION_DURATION, other: 0 }
}

export function isDetached(outingId: string): boolean {
  const ids = read<string[]>(DETACHED_KEY)
  return Array.isArray(ids) && ids.includes(outingId)
}

export function setDetached(outingId: string, detached: boolean) {
  const ids = (read<string[]>(DETACHED_KEY) ?? []).filter(id => typeof id === 'string' && id !== outingId)
  write(DETACHED_KEY, detached ? [outingId, ...ids].slice(0, MAX_DETACHED) : ids)
}
