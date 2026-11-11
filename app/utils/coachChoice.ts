import { DEFAULT_SESSION_DURATION, SESSION_DURATIONS, type SessionDuration } from '#shared/utils/coachSessions'
import { weekStart } from '#shared/utils/coachWeek'

// What the coach page showed today (#267): the duration and the clicks on « Autre séance » of the session of the
// day (#264), kept in this browser for the day, so the coach page shows them again and the review after an outing
// finds the same session.
// And the outings the member said weren't the session of the day. Nothing on the server: the session of the day
// is worked out again from the outings each time, and a session is only matched with an outing of the same day.
// Since #279, one choice per day planned (today and the next ones), a list; before, today's alone, an object.
// Since #285, the days of the week the coach plans (up to 7).
const CHOICE_KEY = 'sport-map:coach-choice'
// The day chosen on the coach page (#279, #285), for the route of the session; kept for the day it was chosen on.
const DAY_KEY = 'sport-map:coach-day'
const DETACHED_KEY = 'sport-map:coach-detached'
// The route traced for today's session (#266): an outing on it is the session, whatever its time.
const SESSION_ROUTE_KEY = 'sport-map:coach-session-route'
// The latest outings detached are enough: only today's can be the session of the day.
const MAX_DETACHED = 20
// A choice for each day of a week
const MAX_CHOICES = 7

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

type SavedChoice = CoachChoice & { date: string }

function isChoice(value: unknown): value is SavedChoice {
  const saved = value as SavedChoice | null
  return typeof saved?.date === 'string' && SESSION_DURATIONS.includes(saved.minutes)
    && Number.isInteger(saved.other) && saved.other >= 0
}

// The choices kept, past days left out (the object of before #279 read as a list of one).
function savedChoices(): SavedChoice[] {
  const raw = read<unknown>(CHOICE_KEY)
  const today = localDate(new Date())
  return (Array.isArray(raw) ? raw : [raw]).filter(isChoice).filter(saved => saved.date >= today)
}

export function saveCoachChoice(choice: CoachChoice, date: string) {
  const others = savedChoices().filter(saved => saved.date !== date)
  write(CHOICE_KEY, [{ minutes: choice.minutes, other: choice.other, date }, ...others].slice(0, MAX_CHOICES))
}

// The choice kept for `date` (a French local date), null without one.
export function savedCoachChoice(date: string): CoachChoice | null {
  const saved = savedChoices().find(choice => choice.date === date)
  return saved ? { minutes: saved.minutes, other: saved.other } : null
}

// The choice kept for `date`, else the session of the day with the default duration.
export function loadCoachChoice(date: string): CoachChoice {
  return savedCoachChoice(date) ?? { minutes: DEFAULT_SESSION_DURATION, other: 0 }
}

export function saveCoachDay(day: string) {
  write(DAY_KEY, { day, date: localDate(new Date()) })
}

// The day chosen today on the coach page, today without one (or when it is no longer one of this week's days to
// come).
export function loadCoachDay(): string {
  const today = localDate(new Date())
  const saved = read<{ day: string, date: string }>(DAY_KEY)
  const ok = saved && saved.date === today && typeof saved.day === 'string' && saved.day >= today
    && weekStart(saved.day) === weekStart(today)
  return ok ? saved.day : today
}

export function isDetached(outingId: string): boolean {
  const ids = read<string[]>(DETACHED_KEY)
  return Array.isArray(ids) && ids.includes(outingId)
}

export function setDetached(outingId: string, detached: boolean) {
  const ids = (read<string[]>(DETACHED_KEY) ?? []).filter(id => typeof id === 'string' && id !== outingId)
  write(DETACHED_KEY, detached ? [outingId, ...ids].slice(0, MAX_DETACHED) : ids)
}

export function saveSessionRoute(routeId: string, today: string) {
  write(SESSION_ROUTE_KEY, { routeId, date: today })
}

// The route traced for today's session, null without one.
export function sessionRouteOf(today: string): string | null {
  const saved = read<{ routeId: string, date: string }>(SESSION_ROUTE_KEY)
  return saved?.date === today && typeof saved.routeId === 'string' ? saved.routeId : null
}
