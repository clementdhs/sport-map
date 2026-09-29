import { describe, expect, it } from 'vitest'
import type { MyProfile } from '#shared/types/routes'
import { activityStats, localDate, metricValue, MONTHS_SHOWN, WEEKS_SHOWN, weekStart, YEARS_SHOWN } from '~/utils/activityStats'

type Completed = MyProfile['completed'][number]

const NOW = new Date('2026-09-30T10:00:00Z') // a Wednesday

function done(completedAt: string, extra: Partial<Completed> = {}): Completed {
  return {
    id: completedAt,
    name: 'Parcours',
    sport_type: 'hiking',
    distance_m: 10_000,
    elevation_gain_m: 500,
    is_public: true,
    is_loop: false,
    rating_avg: null,
    rating_count: 0,
    owner_username: 'moi',
    created_at: completedAt,
    completed_at: completedAt,
    duration_s: null,
    moving_s: null,
    ...extra,
  }
}

describe('dates', () => {
  it('uses French local dates: a Sunday evening outing stays in its week', () => {
    // Sunday 27 September, 23:30 in Paris = 21:30 UTC.
    expect(localDate('2026-09-27T21:30:00Z')).toBe('2026-09-27')
    expect(weekStart('2026-09-27')).toBe('2026-09-21')
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
  })
})

describe('activityStats', () => {
  const completed = [
    done('2026-09-29T08:00:00Z', { moving_s: 7200 }),
    done('2026-09-27T21:30:00Z', { sport_type: 'running', distance_m: 5000, elevation_gain_m: null }),
    done('2026-08-15T08:00:00Z'),
    done('2024-05-01T08:00:00Z'),
    done('2019-05-01T08:00:00Z'),
  ]

  it('sums up by week, oldest first, with empty weeks', () => {
    const weeks = activityStats(completed, 'week', 'all', NOW)
    expect(weeks).toHaveLength(WEEKS_SHOWN)
    const [previous, current] = weeks.slice(-2)
    expect(current).toMatchObject({ key: '2026-09-28', distanceM: 10_000, gainM: 500, movingS: 7200, outings: 1 })
    expect(previous).toMatchObject({ key: '2026-09-21', distanceM: 5000, gainM: 0, outings: 1 })
    expect(current!.fullLabel).toBe('Semaine du 28 septembre 2026')
  })

  it('sums up by month and year, leaving out older outings', () => {
    const months = activityStats(completed, 'month', 'all', NOW)
    expect(months).toHaveLength(MONTHS_SHOWN)
    expect(months.at(-1)).toMatchObject({ key: '2026-09', outings: 2, distanceM: 15_000, fullLabel: 'Septembre 2026' })
    expect(months.at(-2)).toMatchObject({ key: '2026-08', outings: 1 })
    const years = activityStats(completed, 'year', 'all', NOW)
    expect(years.map(y => y.key)).toEqual(['2022', '2023', '2024', '2025', '2026'].slice(-YEARS_SHOWN))
    expect(years.reduce((sum, y) => sum + y.outings, 0)).toBe(4) // 2019 is out of range
  })

  it('filters by sport', () => {
    const running = activityStats(completed, 'year', 'running', NOW)
    expect(running.at(-1)).toMatchObject({ outings: 1, distanceM: 5000 })
  })

  it('reads the chosen metric in chart units', () => {
    const current = activityStats(completed, 'week', 'all', NOW).at(-1)!
    expect(metricValue(current, 'distance')).toBe(10)
    expect(metricValue(current, 'gain')).toBe(500)
    expect(metricValue(current, 'time')).toBe(2)
  })
})
