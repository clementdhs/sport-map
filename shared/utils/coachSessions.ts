import type { CoachGoal } from '../types/account'
import { daysUntil } from './coachGoal'
import { localDate } from './outings'
import { countsForForm, type FormState, type LoadOuting, trainingForm } from './trainingForm'
import { weekSessionCap, weekVolume } from './coachWeek'

// The session of the day (#264): what the coach proposes today from the member's form (trainingForm.ts), their
// goal (coachGoal.ts) and the time they have. Fixed rules, no plan over weeks: the same inputs give the same
// session all day, and "Autre séance" walks through the other sessions the rules allow.

// "Combien de temps as-tu ?", in minutes
export const SESSION_DURATIONS = [30, 45, 60, 90, 120] as const
export type SessionDuration = typeof SESSION_DURATIONS[number]
export const DEFAULT_SESSION_DURATION: SessionDuration = 60

export const SESSION_KINDS = [
  'rest', 'raceDay', 'recovery', 'endurance', 'long', 'longHilly', 'shortHills', 'longHills', 'intervals',
] as const
export type SessionKind = typeof SESSION_KINDS[number]

// The demanding sessions: never two in a row while progressing.
export const KEY_SESSIONS: readonly SessionKind[] = ['long', 'longHilly', 'shortHills', 'longHills', 'intervals']

// The key sessions that fit each duration, the first one being the default pick of the day.
const KEY_BY_DURATION: Record<SessionDuration, SessionKind[]> = {
  30: ['intervals', 'shortHills'],
  45: ['shortHills', 'intervals', 'longHills'],
  60: ['longHills', 'intervals', 'shortHills'],
  90: ['longHilly', 'long', 'longHills'],
  120: ['long', 'longHilly'],
}

// Overload: a short jog, or rest when the last 7 days are over twice the baseline.
export const REST_ABOVE = 2
export const OVERLOAD_MAX_MINUTES = 30
// A long run takes an hour and a half at least: the default duration of the member's long run day (#285).
export const LONG_RUN_MINUTES = 90
// The last week before a race: easy outings of 45 min at most.
export const TAPER_DAYS = 7
export const TAPER_MAX_MINUTES = 45
// A trail race: at least this gain per km. Its long runs are hilly.
export const TRAIL_GAIN_PER_KM = 15
// The most a session weighs (km-effort, #281), whatever the time available: the larger of a share of the member's
// usual week and of their longest outing of the last 30 days plus 10 % (a single outing much longer than the
// recent ones is what injures runners), both lower when easing back in. Never under CAP_MIN_MINUTES of easy run.
export const CAP_SHARE = 0.5
export const RESUME_CAP_SHARE = 0.4
export const CAP_LONGEST = 1.1
export const RESUME_CAP_LONGEST = 1
export const CAP_MIN_MINUTES = 20
// Without any outing in the history nor in the last 30 days (a new member, or back from a long break), sessions
// are kept to half an hour of easy run until the outings say more.
export const UNKNOWN_CAP_MINUTES = 30
// The shortest session with repeats, and the shortest long run: below, a capped one turns into endurance.
const MIN_REPEATS_MINUTES = 30
const MIN_LONG_MINUTES = 60

// Gain per km of the terrain the session asks for (m/km): rolling for the hilly long run, the race's own when it
// has more, nearly flat otherwise.
const FLAT_GAIN_PER_KM = 5
const HILLY_GAIN_PER_KM = 25
const MAX_GAIN_PER_KM = 80
// Paces of the other blocks against the easy pace (min/km): intervals faster, the jog between them slower, the
// recovery jog a little slower. Hill repeats are at the effort pace in km-effort.
const EFFORT_PACE = 0.8
const HILL_EFFORT_PACE = 0.85
const JOG_PACE = 1.3
const RECOVERY_PACE = 1.1
// Gradient of the hills (m of gain per km): steep for the short ones, steady for the long ones.
const SHORT_HILL_GRADE = 100
const LONG_HILL_GRADE = 70

export type BlockKind = 'warmup' | 'easy' | 'hilly' | 'effort' | 'recovery' | 'cooldown'

export type SessionBlock = {
  kind: BlockKind
  minutes: number
  distanceM: number
  gainM: number
}

export type SessionReps = {
  count: number
  effortMin: number
  recoveryMin: number
  // In a hill or on the flat
  hill: boolean
}

export type SessionPlan = {
  kind: SessionKind
  // The session's own duration: the time available, less when the rules cap it (overload, taper, a race's long run)
  minutes: number
  blocks: SessionBlock[]
  reps: SessionReps | null
  distanceM: number
  gainM: number
  // The member's easy pace on the flat (min/km), the one of the endurance blocks
  easyPace: number
}

// Why the coach picked it: the sentence under the title.
export type SessionReason =
  | 'learning' | 'overloadRest' | 'overloadJog' | 'raceDay' | 'taper' | 'raceLong' | 'resume' | 'recovery'
  | 'progressKey' | 'progressEasy' | 'longRunDay' | 'afterHard'

export type SessionChoice = {
  plan: SessionPlan
  reason: SessionReason
  // Days to the race, for the race reasons
  raceDays: number | null
  // How many sessions "Autre séance" walks through (1: the button is hidden)
  options: number
  // Shortened to the cap (#281): the load in km-effort it was not to go over, and what set it: the recent
  // outings (#281) or what is left of the week's target (#284)
  cap: number | null
  capBy: 'recent' | 'week' | null
}

type Option = { kind: SessionKind, minutes: number, gainPerKm?: number, capped?: boolean }

const round = (value: number, step: number) => Math.round(value / step) * step

// A block run at `pace` (min/km) on terrain of `gainPerKm`, in km-effort like the duration estimates for runners
// (estimateDurationMin): 100 m of gain cost as much as a km on the flat.
function block(kind: BlockKind, minutes: number, pace: number, gainPerKm = FLAT_GAIN_PER_KM): SessionBlock {
  const km = minutes / pace / (1 + gainPerKm / 100)
  return { kind, minutes, distanceM: km * 1000, gainM: km * gainPerKm }
}

// Warm-up and cool-down around the repeats: shorter for short sessions.
function warmCool(minutes: number): [number, number] {
  return minutes <= 45 ? [10, 5] : [15, 10]
}

// Repeats between a warm-up and a cool-down. What the repeats leave goes to the cool-down.
function repeats(minutes: number, easyPace: number, effortMin: number, recoveryMin: number, max: number, hillGrade: number | null): { blocks: SessionBlock[], reps: SessionReps } {
  const [warmup, cooldown] = warmCool(minutes)
  const count = Math.max(2, Math.min(max, Math.floor((minutes - warmup - cooldown) / (effortMin + recoveryMin))))
  const blocks = [block('warmup', warmup, easyPace)]
  for (let i = 0; i < count; i++) {
    if (hillGrade === null) {
      blocks.push(block('effort', effortMin, easyPace * EFFORT_PACE, 0), block('recovery', recoveryMin, easyPace * JOG_PACE, 0))
    }
    else {
      // Up at the effort, back down the same way, walking or jogging.
      const up = block('effort', effortMin, easyPace * HILL_EFFORT_PACE, hillGrade)
      blocks.push(up, { kind: 'recovery', minutes: recoveryMin, distanceM: up.distanceM, gainM: 0 })
    }
  }
  const left = minutes - warmup - count * (effortMin + recoveryMin)
  blocks.push(block('cooldown', Math.max(cooldown, left), easyPace))
  return { blocks, reps: { count, effortMin, recoveryMin, hill: hillGrade !== null } }
}

// The blocks of a session of `minutes` at the member's easy pace.
export function buildSession(kind: SessionKind, minutes: number, easyPace: number, gainPerKm?: number): SessionPlan {
  let blocks: SessionBlock[] = []
  let reps: SessionReps | null = null
  switch (kind) {
    case 'rest':
    case 'raceDay':
      minutes = 0
      break
    case 'recovery':
      blocks = [block('easy', minutes, easyPace * RECOVERY_PACE, 0)]
      break
    case 'endurance':
    case 'long':
      blocks = [block('easy', minutes, easyPace, gainPerKm ?? FLAT_GAIN_PER_KM)]
      break
    case 'longHilly': {
      // Rolling terrain: easy and climbing stretches of about 15 min in turn, easy at both ends.
      const parts = Math.max(3, Math.round(minutes / 15) | 1)
      const terrain = Math.min(MAX_GAIN_PER_KM, Math.max(HILLY_GAIN_PER_KM, gainPerKm ?? 0))
      // The easy stretches climb 40 % of the terrain's gain, the others the rest: on average, the terrain's own.
      const easyParts = (parts + 1) / 2
      const climbing = (parts - easyParts * 0.4) / (parts - easyParts)
      blocks = Array.from({ length: parts }, (_, i) => i % 2
        ? block('hilly', minutes / parts, easyPace, terrain * climbing)
        : block('easy', minutes / parts, easyPace, terrain * 0.4))
      break
    }
    case 'shortHills':
      ({ blocks, reps } = repeats(minutes, easyPace, 1, 2, 12, SHORT_HILL_GRADE))
      break
    case 'longHills':
      ({ blocks, reps } = repeats(minutes, easyPace, 3, 3, 10, LONG_HILL_GRADE))
      break
    case 'intervals':
      ({ blocks, reps } = repeats(minutes, easyPace, 3, 2, 10, null))
      break
  }
  return {
    kind,
    minutes,
    blocks,
    reps,
    distanceM: round(blocks.reduce((sum, b) => sum + b.distanceM, 0), 100),
    gainM: round(blocks.reduce((sum, b) => sum + b.gainM, 0), 10),
    easyPace,
  }
}

// The days with an outing counted in the form, before today and inside the member's history (`historyDays`, from
// trainingForm). Its parity makes key sessions and endurance alternate: each outing day moves to the other one,
// and nothing changes until the member goes out again. Today's outings don't count, so the session of the day
// stays the same once done.
export function outingDaysBefore(outings: LoadOuting[], historyDays: number, now = new Date()): number {
  const today = localDate(now)
  const days = new Set<string>()
  for (const outing of outings) {
    if (!countsForForm(outing)) continue
    const date = localDate(outing.completed_at)
    const ago = daysUntil(today, date)
    if (ago > 0 && ago < historyDays) days.add(date)
  }
  return days.size
}

export type CoachInput = {
  state: FormState
  // load ÷ baseline, null while learning
  ratio: number | null
  goal: CoachGoal | null
  minutes: SessionDuration
  // outingDaysBefore()
  outingDays: number
  // The member's easy pace on the flat, min/km
  easyPace: number
  // French local date of today
  today: string
  // The member's usual week and longest recent day in km-effort (trainingForm's `weekly` and `longest`); both
  // unknown (null, 0): UNKNOWN_CAP_MINUTES
  weekly: number | null
  longest: number
  // The most the week's target leaves for this session (weekSessionCap, #284), null without a target
  weekCap?: number | null
  // The member's long run day (#283, #285): the long run, given the time for it
  longRunDay?: boolean
  // The day before has a demanding session planned (#285): never two in a row
  afterHard?: boolean
}

// A race's long run, which grows towards the race's distance: half of it 7 weeks before or more, all of it two
// weeks before, the taper week aside. Never longer than the time available.
export function raceLongRunKm(distanceM: number, days: number): number {
  const weeks = Math.floor(days / 7)
  return (distanceM / 1000) * Math.max(0.5, Math.min(1, 1 - 0.1 * (weeks - 2)))
}

function raceLongRun(goal: CoachGoal, days: number, input: CoachInput): Option {
  const gainPerKm = goal.race_gain_m ? goal.race_gain_m / (goal.race_distance_m! / 1000) : 0
  const trail = gainPerKm >= TRAIL_GAIN_PER_KM
  const km = raceLongRunKm(goal.race_distance_m!, days)
  const terrain = trail ? Math.min(MAX_GAIN_PER_KM, Math.max(HILLY_GAIN_PER_KM, gainPerKm)) : FLAT_GAIN_PER_KM
  // At the easy pace, in km-effort, rounded to 5 min; an hour at least, whatever the race.
  const minutes = Math.min(input.minutes, Math.max(60, round(km * (1 + terrain / 100) * input.easyPace, 5)))
  return { kind: trail ? 'longHilly' : 'long', minutes, gainPerKm: trail ? gainPerKm : undefined }
}

type Rule = { reason: SessionReason, options: Option[], raceDays?: number }

function rule(input: CoachInput): Rule {
  const { state, ratio, goal, minutes } = input
  const easy: Option[] = [{ kind: 'endurance', minutes }]

  // The race comes first, even while the coach is still learning.
  const race = goal?.kind === 'race' && goal.race_date && goal.race_distance_m ? goal : null
  const raceDays = race ? daysUntil(race.race_date!, input.today) : null
  if (race && raceDays === 0) return { reason: 'raceDay', options: [{ kind: 'raceDay', minutes: 0 }], raceDays }
  if (race && raceDays !== null && raceDays > 0 && raceDays <= TAPER_DAYS) {
    return { reason: 'taper', options: [{ kind: 'endurance', minutes: Math.min(minutes, TAPER_MAX_MINUTES) }], raceDays }
  }

  if (state === 'learning') return { reason: 'learning', options: easy }

  if (state === 'overload') {
    return (ratio ?? 0) > REST_ABOVE
      ? { reason: 'overloadRest', options: [{ kind: 'rest', minutes: 0 }] }
      : { reason: 'overloadJog', options: [{ kind: 'recovery', minutes: Math.min(minutes, OVERLOAD_MAX_MINUTES) }] }
  }

  // Getting ready for a race (past races aside)
  const ahead = race && raceDays !== null && raceDays > 0 ? raceDays : undefined

  // The member's long run day (#285), given the time for one: the race's long run when getting ready for one.
  if (input.longRunDay && minutes >= LONG_RUN_MINUTES && !input.afterHard) {
    if (race && ahead) return { reason: 'raceLong', options: [raceLongRun(race, ahead, input)], raceDays: ahead }
    return { reason: 'longRunDay', options: [{ kind: 'long', minutes }] }
  }

  if (goal?.kind === 'resume') {
    return { reason: 'resume', options: minutes >= LONG_RUN_MINUTES ? [{ kind: 'long', minutes }, ...easy] : easy }
  }

  // Never two demanding sessions in a row (#285).
  if (input.afterHard) return { reason: 'afterHard', options: easy }
  // Recovery: rested enough for a key session. Progress: one key session out of two outing days.
  const key = state === 'recovery' || input.outingDays % 2 === 0
  if (!key) return { reason: 'progressEasy', options: easy }
  // With time for it, the long run that grows towards the race.
  if (race && ahead && minutes >= 90) return { reason: 'raceLong', options: [raceLongRun(race, ahead, input)], raceDays: ahead }
  return {
    reason: state === 'recovery' ? 'recovery' : 'progressKey',
    options: KEY_BY_DURATION[minutes].map(kind => ({ kind, minutes })),
    raceDays: ahead,
  }
}

// A session's load in km-effort, like the form's (trainingForm.ts).
export function sessionLoad(plan: Pick<SessionPlan, 'distanceM' | 'gainM'>): number {
  return plan.distanceM / 1000 + plan.gainM / 100
}

// The most a session may weigh (km-effort) from the recent outings.
export function sessionCap(input: Pick<CoachInput, 'weekly' | 'longest' | 'goal' | 'easyPace'>): number {
  if (input.weekly === null && !input.longest) return UNKNOWN_CAP_MINUTES / input.easyPace
  const resume = input.goal?.kind === 'resume'
  return Math.max(
    CAP_MIN_MINUTES / input.easyPace,
    (input.weekly ?? 0) * (resume ? RESUME_CAP_SHARE : CAP_SHARE),
    input.longest * (resume ? RESUME_CAP_LONGEST : CAP_LONGEST),
  )
}

const isRepeats = (kind: SessionKind) => kind === 'shortHills' || kind === 'longHills' || kind === 'intervals'

// The option shortened to weigh `cap` at most: repeats lose time down to MIN_REPEATS_MINUTES, then turn into an
// endurance run; runs are cut to the cap (5 min steps, CAP_MIN_MINUTES at least), a long run too short to be one
// becoming endurance.
function capOption(option: Option, cap: number, easyPace: number): Option {
  if (!option.minutes) return option
  const load = (o: Option) => sessionLoad(buildSession(o.kind, o.minutes, easyPace, o.gainPerKm))
  if (load(option) <= cap) return option
  if (isRepeats(option.kind)) {
    for (let minutes = option.minutes - 5; minutes >= MIN_REPEATS_MINUTES; minutes -= 5) {
      if (load({ ...option, minutes }) <= cap) return { ...option, minutes, capped: true }
    }
  }
  // A run's load is its time at its pace, whatever the terrain: the easy pace, a little slower for a recovery jog.
  const pace = option.kind === 'recovery' ? easyPace * RECOVERY_PACE : easyPace
  const minutes = Math.min(option.minutes, Math.max(CAP_MIN_MINUTES, Math.floor((cap * pace) / 5) * 5))
  const run = option.kind === 'recovery' || ((option.kind === 'long' || option.kind === 'longHilly') && minutes >= MIN_LONG_MINUTES)
  return run
    ? { ...option, minutes, capped: true }
    : { kind: 'endurance', minutes, capped: true }
}

// The session of the day. `other` counts the clicks on "Autre séance".
export function sessionOfTheDay(input: CoachInput, other = 0): SessionChoice {
  const rules = rule(input)
  const recent = sessionCap(input)
  // The week's target only shortens it further, never under CAP_MIN_MINUTES of easy run.
  const byWeek = input.weekCap !== undefined && input.weekCap !== null && input.weekCap < recent
  const cap = byWeek ? Math.max(CAP_MIN_MINUTES / input.easyPace, input.weekCap!) : recent
  // Capping can make two sessions the same (both turned into endurance): "Autre séance" only walks through
  // different ones.
  const options: Option[] = []
  for (const option of rules.options) {
    const capped = capOption(option, cap, input.easyPace)
    if (!options.some(o => o.kind === capped.kind && o.minutes === capped.minutes)) options.push(capped)
  }
  // The pick moves on each day (days since 1970) among the sessions allowed.
  const option = options[(daysUntil(input.today, '1970-01-01') + other) % options.length]!
  return {
    plan: buildSession(option.kind, option.minutes, input.easyPace, option.gainPerKm),
    reason: rules.reason,
    raceDays: rules.raceDays ?? null,
    options: options.length,
    cap: option.capped ? cap : null,
    capBy: option.capped ? (byWeek ? 'week' : 'recent') : null,
  }
}

// The days the coach plans a session for (#279): today and the next ones the forecast covers (Open-Meteo's 4
// days, `forecastAt`), so the best weather slot follows whichever day is chosen.
export const COACH_DAYS = 4

// Today and the next COACH_DAYS - 1 days, as French local dates. Counted on the calendar, not in 24 h steps, so a
// change to or from summer time never skips or repeats a day.
export function coachDays(now = new Date()): string[] {
  const today = dayNoon(localDate(now)).getTime()
  return Array.from({ length: COACH_DAYS }, (_, i) => new Date(today + i * 86_400_000).toISOString().slice(0, 10))
}

// A moment of `day` (a French local date): midday UTC is that same date in France, summer or winter.
export function dayNoon(day: string): Date {
  return new Date(`${day}T12:00:00Z`)
}

export type DayInput = {
  goal: CoachGoal | null
  minutes: SessionDuration
  easyPace: number
}

// What the week plan (#285, coachPlan.ts) knows about a day that the outings alone don't: the sessions it plans
// before it this week, whether the day before is a demanding one, and whether it is the member's long run day.
export type DayContext = {
  // Outing days the plan puts before this one this week, counted like outings for the alternation
  plannedBefore: number
  // Their load (km-effort), counted in the week's volume like outings done
  plannedLoad: number
  // This day and the planned ones after it
  outingsLeft: number
  afterHard: boolean
  longRunDay: boolean
}

// The session of `day` (a French local date, today or later) if the member doesn't go out before it: the rules of
// #264 on that day's form, the outings until then counted among the days before, and with the week plan's
// `context` (#285) the sessions it plans before it.
export function sessionOn(outings: LoadOuting[], input: DayInput, day: string, other = 0, context?: DayContext): SessionChoice {
  const at = dayNoon(day)
  const form = trainingForm(outings, at)
  const week = weekVolume(outings, input.goal, day)
  const weekCap = !week
    ? null
    : weekSessionCap(context
      ? { ...week, doneBefore: week.doneBefore + context.plannedLoad, outingsLeft: Math.max(1, context.outingsLeft) }
      : week)
  return sessionOfTheDay({
    ...input,
    state: form.state,
    ratio: form.ratio,
    outingDays: outingDaysBefore(outings, form.historyDays, at) + (context?.plannedBefore ?? 0),
    today: day,
    weekly: form.weekly,
    longest: form.longest,
    weekCap,
    longRunDay: context?.longRunDay,
    afterHard: context?.afterHard,
  }, other)
}
