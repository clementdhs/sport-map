import { describe, expect, it } from 'vitest'
import type { LoadOuting } from '#shared/utils/trainingForm'
import {
  CHART_WEEKS,
  countsForForm,
  formState,
  formWeeks,
  gaugePosition,
  MIN_HISTORY_DAYS,
  outingLoad,
  trainingForm,
} from '#shared/utils/trainingForm'

const NOW = new Date('2026-11-09T10:00:00Z') // a Monday

// An outing `ago` days before NOW, at noon in Paris.
function outing(ago: number, km = 10, gain = 0, extra: Partial<LoadOuting> = {}): LoadOuting {
  return {
    sport_type: 'running',
    distance_m: km * 1000,
    elevation_gain_m: gain,
    completed_at: new Date(Date.parse('2026-11-09T11:00:00Z') - ago * 86_400_000).toISOString(),
    ...extra,
  }
}

// Steady weeks: one 10 km outing every `every` days over the last `days` days.
function steady(days: number, every = 2, km = 10): LoadOuting[] {
  const outings: LoadOuting[] = []
  for (let ago = 0; ago < days; ago += every) outings.push(outing(ago, km))
  return outings
}

describe('outingLoad', () => {
  it('counts 1 per km and 1 per 100 m of gain', () => {
    expect(outingLoad({ distance_m: 14_000, elevation_gain_m: 680 })).toBeCloseTo(20.8)
    expect(outingLoad({ distance_m: 8000, elevation_gain_m: null })).toBe(8)
  })

  it('leaves cycling out', () => {
    expect(countsForForm({ sport_type: 'trail' })).toBe(true)
    expect(countsForForm({ sport_type: 'hiking' })).toBe(true)
    expect(countsForForm({ sport_type: 'road_cycling' })).toBe(false)
    const form = trainingForm([...steady(35), outing(0, 100, 0, { sport_type: 'cycling' })], NOW)
    expect(form.recent.every(r => r.outing.sport_type === 'running')).toBe(true)
  })
})

describe('formState', () => {
  it('splits the ratio at × 0.8 and × 1.5', () => {
    expect(formState(null)).toBe('learning')
    expect(formState(0)).toBe('recovery')
    expect(formState(0.79)).toBe('recovery')
    expect(formState(0.8)).toBe('progress')
    expect(formState(1.5)).toBe('progress')
    expect(formState(1.51)).toBe('overload')
  })
})

describe('trainingForm', () => {
  it('is learning without outings', () => {
    const form = trainingForm([], NOW)
    expect(form).toMatchObject({ state: 'learning', ratio: null, load: 0, baseline: null, historyDays: 0, days: [] })
  })

  it('compares the last 7 days with the weekly average of the 4 weeks before', () => {
    // 4 weeks of 20 km-effort, then a week of 30
    const outings = [
      ...[7, 14, 21, 28].flatMap(start => [outing(start + 1), outing(start + 4)]),
      outing(0, 15),
      outing(3, 15),
      outing(45), // the history goes on before the 4 weeks
    ]
    const form = trainingForm(outings, NOW)
    expect(form.historyDays).toBe(46)
    expect(form.baselineDays).toBe(28)
    expect(form.load).toBe(30)
    expect(form.baseline).toBe(20)
    expect(form.ratio).toBe(1.5)
    expect(form.state).toBe('progress')
    expect(form.start).toBe('2026-11-03')
    expect(form.end).toBe('2026-11-09')
  })

  it('tells recovery and overload', () => {
    const base = [7, 14, 21, 28].flatMap(start => [outing(start + 1), outing(start + 4)])
    expect(trainingForm([...base, outing(2)], NOW).state).toBe('recovery') // 10 / 20
    expect(trainingForm([...base, outing(1, 20), outing(2, 20)], NOW).state).toBe('overload') // 40 / 20
    expect(trainingForm(base, NOW)).toMatchObject({ load: 0, ratio: 0, state: 'recovery' })
  })

  it('sums the outings of the same day', () => {
    const base = [7, 14, 21, 28].flatMap(start => [outing(start + 1), outing(start + 4)])
    const form = trainingForm([...base, outing(0, 10), outing(0, 10, 500)], NOW)
    expect(form.load).toBe(25)
    expect(form.recent).toHaveLength(2)
  })

  it('waits for 3 weeks of history', () => {
    const short = trainingForm(steady(MIN_HISTORY_DAYS - 1, 1), NOW)
    expect(short.historyDays).toBe(20)
    expect(short).toMatchObject({ state: 'learning', ratio: null, baseline: null })
    const enough = trainingForm(steady(MIN_HISTORY_DAYS, 1), NOW)
    expect(enough.historyDays).toBe(21)
    expect(enough.state).toBe('progress')
  })

  it('averages only the weeks of history inside the 4 weeks before', () => {
    // 3 weeks of 10 km every day: 70 km-effort a week, judged on the 2 weeks before the last 7 days
    const form = trainingForm(steady(21, 1), NOW)
    expect(form.baselineDays).toBe(14)
    expect(form.baseline).toBe(70)
    expect(form.ratio).toBe(1)
  })

  it('starts learning again after a long break', () => {
    const form = trainingForm([outing(80), outing(70), outing(2)], NOW)
    expect(form.historyDays).toBe(3)
    expect(form.state).toBe('learning')
    // Gaps of up to 4 weeks keep the history going
    expect(trainingForm([outing(60), outing(33), outing(6)], NOW).historyDays).toBe(61)
  })

  it('lists the days of the history with their outings', () => {
    const form = trainingForm([outing(9), outing(6), outing(4), outing(0)], NOW)
    expect(form.days).toEqual([true, false, false, true, false, true, false, false, false, true])
    expect(trainingForm(steady(30), NOW).days).toEqual([])
  })

  it('dates outings in Paris', () => {
    // The last 7 days of Sunday 8 November start on Monday 2: 23:30 UTC on Sunday 1 is already Monday in Paris
    const sunday = new Date('2026-11-08T12:00:00Z')
    expect(trainingForm([{ ...outing(0), completed_at: '2026-11-01T22:30:00Z' }], sunday).recent).toHaveLength(0)
    expect(trainingForm([{ ...outing(0), completed_at: '2026-11-01T23:30:00Z' }], sunday).recent).toHaveLength(1)
  })

  it('ignores outings dated after today', () => {
    expect(trainingForm([outing(-2)], NOW).load).toBe(0)
  })

  it('lists the last 7 days, latest first', () => {
    const form = trainingForm([outing(7), outing(6), outing(1, 8, 60)], NOW)
    expect(form.recent.map(r => r.date)).toEqual(['2026-11-08', '2026-11-03'])
    expect(form.recent[0]!.load).toBeCloseTo(8.6)
    expect(form.distanceM).toBe(18_000)
    expect(form.gainM).toBe(60)
  })
})

describe('usual week and longest outing (#281)', () => {
  it('is the baseline once the history is long enough', () => {
    const form = trainingForm(steady(35), NOW)
    expect(form.weekly).toBe(form.baseline)
  })

  it('averages the history while learning, from a week on', () => {
    // 10 km on days 0, 4, 8 and 12: 40 km over 13 days
    expect(trainingForm(steady(13, 4), NOW).weekly).toBeCloseTo((40 / 13) * 7)
    expect(trainingForm([outing(0), outing(3)], NOW).weekly).toBeNull()
    expect(trainingForm([], NOW).weekly).toBeNull()
  })

  it('keeps the heaviest day of the last 30 days', () => {
    const form = trainingForm([outing(1, 6, 60), outing(1, 2), outing(10, 7), outing(30, 20)], NOW)
    // 6 km + 60 m and 2 km the same day
    expect(form.longest).toBeCloseTo(8.6)
    expect(trainingForm([], NOW).longest).toBe(0)
  })
})

describe('formWeeks', () => {
  it('gives 8 windows of 7 days, the latest being the form of the moment', () => {
    const outings = steady(70)
    const weeks = formWeeks(outings, NOW)
    expect(weeks).toHaveLength(CHART_WEEKS)
    expect(weeks.at(-1)).toMatchObject({ end: '2026-11-09', start: '2026-11-03' })
    expect(weeks[0]).toMatchObject({ end: '2026-09-21', start: '2026-09-15' })
    const form = trainingForm(outings, NOW)
    expect(weeks.at(-1)!.load).toBe(form.load)
    expect(weeks.at(-1)!.baseline).toBe(form.baseline)
    // History starts 69 days ago: the oldest windows have no baseline yet
    expect(weeks[0]!.baseline).toBeNull()
    expect(weeks[CHART_WEEKS - 3]!.baseline).not.toBeNull()
  })
})

describe('gaugePosition', () => {
  it('maps the zones on 30 / 45 / 25 % of the gauge', () => {
    expect(gaugePosition(0)).toBe(0)
    expect(gaugePosition(0.4)).toBeCloseTo(15)
    expect(gaugePosition(0.8)).toBeCloseTo(30)
    expect(gaugePosition(1.5)).toBeCloseTo(75)
    expect(gaugePosition(2)).toBe(100)
    expect(gaugePosition(5)).toBe(100)
  })
})
