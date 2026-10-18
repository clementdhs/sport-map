import type { StatsOuting } from '#shared/types/routes'
import { DEFAULT_FORMAT_LOCALE } from '#shared/utils/format'
import { localDate } from '#shared/utils/outings'
import type { SportType } from '#shared/utils/routes'

// Totals of the outings of the profile, by week, month or year, for the statistics tab.

export type StatsPeriod = 'week' | 'month' | 'year'
export type StatsMetric = 'distance' | 'gain' | 'time'

export interface StatsBucket {
  key: string
  // Short axis label and full tooltip label
  label: string
  fullLabel: string
  distanceM: number
  gainM: number
  // Moving time of the outings recorded with the GPS only: routes just marked as done have none
  movingS: number
  outings: number
}

export const WEEKS_SHOWN = 12
export const MONTHS_SHOWN = 12
export const YEARS_SHOWN = 5

const DAY_MS = 86_400_000
const toUtc = (date: string) => Date.parse(`${date}T12:00:00Z`)
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Monday of the week of a local date.
export function weekStart(date: string): string {
  const day = new Date(toUtc(date)).getUTCDay()
  return fromUtc(toUtc(date) - ((day + 6) % 7) * DAY_MS)
}

function bucketKey(date: string, period: StatsPeriod): string {
  if (period === 'week') return weekStart(date)
  return period === 'month' ? date.slice(0, 7) : date.slice(0, 4)
}

// For a week, fullLabel is the date of its Monday: the component words it ("Week of …").
function labels(key: string, period: StatsPeriod, locale: string): { label: string, fullLabel: string } {
  const format = (options: Intl.DateTimeFormatOptions, date: string) =>
    new Date(toUtc(date)).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
  if (period === 'week') {
    return { label: format({ day: 'numeric', month: 'short' }, key), fullLabel: format({ day: 'numeric', month: 'long', year: 'numeric' }, key) }
  }
  if (period === 'month') {
    const month = format({ month: 'long', year: 'numeric' }, `${key}-01`)
    return { label: format({ month: 'short' }, `${key}-01`), fullLabel: month.charAt(0).toUpperCase() + month.slice(1) }
  }
  return { label: key, fullLabel: key }
}

// The last buckets of the period up to today's, oldest first, including empty ones.
function bucketKeys(period: StatsPeriod, today: string): string[] {
  const keys: string[] = []
  if (period === 'week') {
    const monday = toUtc(weekStart(today))
    for (let i = WEEKS_SHOWN - 1; i >= 0; i--) keys.push(fromUtc(monday - i * 7 * DAY_MS))
  }
  else if (period === 'month') {
    const [year, month] = today.split('-').map(Number) as [number, number]
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const date = new Date(Date.UTC(year, month - 1 - i, 1))
      keys.push(date.toISOString().slice(0, 7))
    }
  }
  else {
    const year = Number(today.slice(0, 4))
    for (let i = YEARS_SHOWN - 1; i >= 0; i--) keys.push(String(year - i))
  }
  return keys
}

export function activityStats(
  outings: StatsOuting[],
  period: StatsPeriod,
  sport: SportType | 'all',
  now = new Date(),
  locale = DEFAULT_FORMAT_LOCALE,
): StatsBucket[] {
  const buckets = new Map(bucketKeys(period, localDate(now)).map(key => [key, {
    key,
    ...labels(key, period, locale),
    distanceM: 0,
    gainM: 0,
    movingS: 0,
    outings: 0,
  } satisfies StatsBucket]))

  for (const outing of outings) {
    if (sport !== 'all' && outing.sport_type !== sport) continue
    const bucket = buckets.get(bucketKey(localDate(outing.completed_at), period))
    if (!bucket) continue // older than the buckets shown
    bucket.distanceM += outing.distance_m
    bucket.gainM += outing.elevation_gain_m ?? 0
    bucket.movingS += outing.moving_s ?? 0
    bucket.outings++
  }
  return [...buckets.values()]
}

export function metricValue(bucket: StatsBucket, metric: StatsMetric): number {
  if (metric === 'distance') return bucket.distanceM / 1000
  return metric === 'gain' ? bucket.gainM : bucket.movingS / 3600
}
