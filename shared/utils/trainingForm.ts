import type { StatsOuting } from '../types/routes'
import { localDate } from './outings'
import { SPORT_KINDS } from './routes'

// The coach's form of the moment (#263): the load of the last 7 days against the member's usual load (their
// "fond", the weekly average of the 4 weeks before). No heart rate: the load is in km-effort, 1 km on the flat
// = 1, 100 m of gain = 1 km. Pure, computed in the browser from the profile's outings.

export type LoadOuting = Pick<StatsOuting, 'sport_type' | 'distance_m' | 'elevation_gain_m' | 'completed_at'>

// recovery: under × 0.8, progress: × 0.8 to 1.5, overload: over × 1.5; learning: not enough history yet
export type FormState = 'learning' | 'recovery' | 'progress' | 'overload'

export const RECENT_DAYS = 7
export const BASELINE_DAYS = 28
// The coach judges the form once the member's outings cover 3 weeks.
export const MIN_HISTORY_DAYS = 21
export const RECOVERY_BELOW = 0.8
export const OVERLOAD_ABOVE = 1.5
export const CHART_WEEKS = 8

const DAY_MS = 86_400_000
const toUtc = (date: string) => Date.parse(`${date}T12:00:00Z`)
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Cycling is left out at first: a kilometre on a bike isn't a kilometre on foot.
export function countsForForm(outing: Pick<LoadOuting, 'sport_type'>): boolean {
  return SPORT_KINDS[outing.sport_type] !== 'ride'
}

export function outingLoad(outing: Pick<LoadOuting, 'distance_m' | 'elevation_gain_m'>): number {
  return Math.max(0, outing.distance_m) / 1000 + Math.max(0, outing.elevation_gain_m ?? 0) / 100
}

export type FormWindow = {
  // Local date of the window's last day and first day
  end: string
  start: string
  // km-effort of the 7 days ending on `end`
  load: number
  // Weekly average of the days before the window, null while the history is too short
  baseline: number | null
  // How many days the baseline averages: 28, fewer when the history starts inside those 4 weeks
  baselineDays: number
  // Days from the start of the member's history to `end`, both included (0 without outings)
  historyDays: number
}

export type FormSummary<T extends LoadOuting = LoadOuting> = FormWindow & {
  state: FormState
  // load ÷ baseline, null while learning
  ratio: number | null
  // The last 7 days' outings, latest first, with their load
  recent: { outing: T, load: number, date: string }[]
  distanceM: number
  gainM: number
  // While learning: from the first day of the history to today, whether each day has an outing (empty after)
  days: boolean[]
}

type DailyLoads = {
  // km-effort by days before today (0 = today), the same day's outings summed
  loads: Map<number, number>
  // Those days, most recent first
  agos: number[]
}

// Counts only the outings of the form.
function dailyLoads(outings: LoadOuting[], today: string): DailyLoads {
  const loads = new Map<number, number>()
  const todayMs = toUtc(today)
  for (const outing of outings) {
    if (!countsForForm(outing)) continue
    const ago = Math.round((todayMs - toUtc(localDate(outing.completed_at))) / DAY_MS)
    if (ago < 0) continue
    loads.set(ago, (loads.get(ago) ?? 0) + outingLoad(outing))
  }
  return { loads, agos: [...loads.keys()].sort((a, b) => a - b) }
}

// The first day of the member's history as of `endAgo`: going back from there, the oldest outing before a gap of
// more than 4 weeks, so a member back from a long break starts learning again. -1 without outings.
function historyStart({ agos }: DailyLoads, endAgo: number): number {
  let first = -1
  for (const ago of agos) {
    if (ago < endAgo) continue
    if (first >= 0 && ago - first > BASELINE_DAYS) break
    first = ago
  }
  return first
}

// The window of 7 days ending `endAgo` days before today. The baseline averages only the days of the history,
// so a member with 3 weeks of outings isn't judged on 4.
function windowAt(daily: DailyLoads, today: string, endAgo: number): FormWindow {
  let load = 0
  let baselineLoad = 0
  for (let ago = endAgo; ago < endAgo + RECENT_DAYS + BASELINE_DAYS; ago++) {
    const day = daily.loads.get(ago) ?? 0
    if (ago < endAgo + RECENT_DAYS) load += day
    else baselineLoad += day
  }
  const first = historyStart(daily, endAgo)
  const historyDays = first < 0 ? 0 : first - endAgo + 1
  const baselineDays = Math.max(0, Math.min(BASELINE_DAYS, historyDays - RECENT_DAYS))
  const endMs = toUtc(today) - endAgo * DAY_MS
  return {
    end: fromUtc(endMs),
    start: fromUtc(endMs - (RECENT_DAYS - 1) * DAY_MS),
    load,
    baseline: historyDays >= MIN_HISTORY_DAYS ? (baselineLoad / baselineDays) * 7 : null,
    baselineDays,
    historyDays,
  }
}

export function formState(ratio: number | null): FormState {
  if (ratio === null) return 'learning'
  if (ratio < RECOVERY_BELOW) return 'recovery'
  return ratio > OVERLOAD_ABOVE ? 'overload' : 'progress'
}

export function trainingForm<T extends LoadOuting>(outings: T[], now = new Date()): FormSummary<T> {
  const today = localDate(now)
  const daily = dailyLoads(outings, today)
  const window = windowAt(daily, today, 0)
  // A baseline of 0 (outings of no distance) gives no ratio either.
  const ratio = window.baseline ? window.load / window.baseline : null
  const recent = outings
    .filter(countsForForm)
    .map(outing => ({ outing, load: outingLoad(outing), date: localDate(outing.completed_at) }))
    .filter(({ date }) => date >= window.start && date <= today)
    .sort((a, b) => b.outing.completed_at.localeCompare(a.outing.completed_at))
  const days: boolean[] = []
  if (window.historyDays < MIN_HISTORY_DAYS) {
    for (let ago = window.historyDays - 1; ago >= 0; ago--) days.push(daily.loads.has(ago))
  }
  return {
    ...window,
    state: formState(ratio),
    ratio,
    recent,
    distanceM: recent.reduce((sum, { outing }) => sum + outing.distance_m, 0),
    gainM: recent.reduce((sum, { outing }) => sum + (outing.elevation_gain_m ?? 0), 0),
    days,
  }
}

// The chart of the detail page: the last 8 windows of 7 days, the latest ending today, oldest first, each with
// the baseline it was judged against (the latest one is the form of the moment).
export function formWeeks(outings: LoadOuting[], now = new Date()): FormWindow[] {
  const today = localDate(now)
  const daily = dailyLoads(outings, today)
  const weeks: FormWindow[] = []
  for (let week = CHART_WEEKS - 1; week >= 0; week--) weeks.push(windowAt(daily, today, week * RECENT_DAYS))
  return weeks
}

// Where the ratio stands on the three-zone gauge, in % of its width: recovery takes 0–30 %, progress 30–75 %,
// overload 75–100 % (up to × 2).
export const GAUGE_ZONES = { recovery: 30, progress: 45, overload: 25 } as const
const GAUGE_MAX = 2

export function gaugePosition(ratio: number): number {
  const r = Math.max(0, Math.min(GAUGE_MAX, ratio))
  const recovery = GAUGE_ZONES.recovery
  const progress = recovery + GAUGE_ZONES.progress
  if (r < RECOVERY_BELOW) return (r / RECOVERY_BELOW) * recovery
  if (r <= OVERLOAD_ABOVE) return recovery + ((r - RECOVERY_BELOW) / (OVERLOAD_ABOVE - RECOVERY_BELOW)) * GAUGE_ZONES.progress
  return progress + ((r - OVERLOAD_ABOVE) / (GAUGE_MAX - OVERLOAD_ABOVE)) * GAUGE_ZONES.overload
}
