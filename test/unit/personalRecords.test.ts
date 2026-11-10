import { describe, expect, it } from 'vitest'
import type { RecordOuting } from '#shared/types/routes'
import { BEST_EFFORTS_VERSION, type BestEfforts } from '#shared/utils/bestEfforts'
import { isRecentRecord, personalRecords, recordBreakers, recordYears } from '#shared/utils/personalRecords'

const runEfforts = (times: BestEfforts['times']): BestEfforts => ({ v: BEST_EFFORTS_VERSION, kind: 'run', times })

let count = 0
function outing(completedAt: string, extra: Partial<RecordOuting> = {}): RecordOuting {
  count++
  return {
    route_id: `route-${count}`,
    route_name: `Parcours ${count}`,
    outing_id: `outing-${count}`,
    completed_at: completedAt,
    sport_type: 'running',
    distance_m: 10_000,
    elevation_gain_m: 100,
    moving_s: 3000,
    covered_m: null,
    best_efforts: null,
    ...extra,
  }
}

const summary = (records: ReturnType<typeof personalRecords>) => records.map(r => [r.key, r.value, r.outing.outing_id])

describe('personalRecords', () => {
  const january = outing('2026-01-10T10:00:00Z', { distance_m: 12_000, best_efforts: runEfforts({ '1k': 280, '5k': 1500 }) })
  const march = outing('2026-03-10T10:00:00Z', { elevation_gain_m: 400, moving_s: 4000, best_efforts: runEfforts({ '1k': 260, '5k': 1550, '10k': 3100 }) })
  const lastYear = outing('2025-06-01T10:00:00Z', { distance_m: 21_000, best_efforts: runEfforts({ '1k': 250 }) })
  const ride = outing('2026-02-01T10:00:00Z', {
    sport_type: 'road_cycling',
    distance_m: 60_000,
    elevation_gain_m: 800,
    moving_s: 7200,
    best_efforts: { v: BEST_EFFORTS_VERSION, kind: 'ride', times: { '10k': 1100 }, hour_m: 32_000 },
  })
  // A route only marked as done: it can hold the longest outing, no best time.
  const markedDone = outing('2026-04-01T10:00:00Z', { outing_id: null, distance_m: 15_000, elevation_gain_m: null, moving_s: null })
  const all = [march, ride, lastYear, markedDone, january]

  it('keeps the best of each record of the year, with its outing', () => {
    expect(summary(personalRecords(all, 'running', 2026))).toEqual([
      ['distance', 15_000, null],
      ['gain', 400, march.outing_id],
      ['moving', 4000, march.outing_id],
      ['time:running:1k', 260, march.outing_id],
      ['time:running:5k', 1500, january.outing_id],
      ['time:running:10k', 3100, march.outing_id],
    ])
  })

  it('counts every year when asked', () => {
    const records = personalRecords(all, 'running', 'all')
    expect(records.find(r => r.key === 'distance')!.outing).toBe(lastYear)
    expect(records.find(r => r.key === 'time:running:1k')!.value).toBe(250)
  })

  it('groups the best times by sport after the overall records for every sport', () => {
    expect(personalRecords(all, 'all', 2026).map(r => r.key)).toEqual([
      'distance', 'gain', 'moving',
      'time:running:1k', 'time:running:5k', 'time:running:10k',
      'time:road_cycling:10k', 'hour:road_cycling',
    ])
  })

  it('leaves the first outing a tie', () => {
    const again = outing('2026-05-01T10:00:00Z', { route_id: january.route_id, distance_m: 15_000 })
    expect(personalRecords([again, markedDone], 'running', 2026)[0]!.outing).toBe(markedDone)
  })

  it('ignores best efforts worked out for another kind of sport', () => {
    // The route became a cycling one after its outing: its running times aren't cycling times.
    const changed = outing('2026-06-01T10:00:00Z', { sport_type: 'cycling', best_efforts: runEfforts({ '1k': 200 }) })
    expect(personalRecords([changed], 'all', 2026).map(r => r.key)).toEqual(['distance', 'gain', 'moving'])
  })

  it('finds nothing in a year without outings', () => {
    expect(personalRecords(all, 'all', 2024)).toEqual([])
  })
})

it('takes the distance a recorded outing covered, not its route\'s', () => {
  // Stopped after 12 km of a 40 km route: shorter than a 15 km route marked as done.
  const halfway = outing('2026-02-01T10:00:00Z', { distance_m: 40_000, covered_m: 12_000 })
  const done = outing('2026-03-01T10:00:00Z', { outing_id: null, distance_m: 15_000 })
  expect(personalRecords([halfway, done], 'running', 2026)[0]!.outing).toBe(done)
})

describe('recordBreakers', () => {
  it('marks the outings that beat a record of their sport when recorded', () => {
    const first = outing('2026-01-10T10:00:00Z', { best_efforts: runEfforts({ '1k': 280, '5k': 1500 }) })
    const slower = outing('2026-02-10T10:00:00Z', { moving_s: 2000, best_efforts: runEfforts({ '1k': 290 }) })
    const faster = outing('2026-03-10T10:00:00Z', { distance_m: 11_000, best_efforts: runEfforts({ '1k': 270, '5k': 1500 }) })
    // A first ride beats no record, even though it's longer than every run.
    const ride = outing('2026-04-10T10:00:00Z', { sport_type: 'cycling', distance_m: 50_000 })
    expect(recordBreakers([ride, faster, first, slower])).toEqual({
      [faster.outing_id!]: [{ metric: 'distance', effort: null }, { metric: 'time', effort: '1k' }],
    })
  })
})

describe('recordYears', () => {
  it('lists the years with outings, latest first, in French time', () => {
    expect(recordYears([outing('2025-12-31T23:30:00Z'), outing('2024-05-01T10:00:00Z'), outing('2025-03-01T10:00:00Z')]))
      .toEqual([2026, 2025, 2024])
  })
})

describe('isRecentRecord', () => {
  const now = new Date('2026-11-07T12:00:00Z')
  it('badges the records of the last 30 days only', () => {
    expect(isRecentRecord('2026-11-02T08:00:00Z', now)).toBe(true)
    expect(isRecentRecord('2026-10-09T08:00:00Z', now)).toBe(true)
    expect(isRecentRecord('2026-10-07T08:00:00Z', now)).toBe(false)
    expect(isRecentRecord('2026-11-08T08:00:00Z', now)).toBe(false)
  })
})
