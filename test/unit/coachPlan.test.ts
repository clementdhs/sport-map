import { describe, expect, it } from 'vitest'
import type { CoachGoal } from '#shared/types/account'
import { daySession, defaultMinutes, type PlanOuting, weekPlan } from '#shared/utils/coachPlan'
import { KEY_SESSIONS, LONG_RUN_MINUTES, sessionLoad } from '#shared/utils/coachSessions'
import { weekVolume } from '#shared/utils/coachWeek'

// Thursday 12 November 2026, 11:00 in Paris; its week runs from Monday the 9th to Sunday the 15th
const NOW = new Date('2026-11-12T10:00:00Z')
const MONDAY = '2026-11-09'

const daysBefore = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
// A run on `date` at noon in Paris: `km` in `minutes` of moving time
function run(date: string, km = 10, minutes = 60): PlanOuting {
  return { sport_type: 'running', distance_m: km * 1000, elevation_gain_m: 0, completed_at: `${date}T11:00:00Z`, moving_s: minutes * 60 }
}
// 10 km every other day over the 6 weeks before Monday: about 35 km-effort a week
const history = () => Array.from({ length: 21 }, (_, i) => run(daysBefore(MONDAY, 1 + i * 2)))

const goal = (extra: Partial<CoachGoal> = {}): CoachGoal => ({
  kind: 'progress', race_date: null, race_distance_m: null, race_gain_m: null, outings_per_week: 3, preferred_days: [], long_run_day: null, ...extra,
})
const input = (g: CoachGoal | null, choiceOf: (date: string) => null | { minutes: 30 | 45 | 60 | 90 | 120, other: number } = () => null) =>
  ({ goal: g, easyPace: 6, choiceOf })

describe('weekPlan', () => {
  it('gives the 7 days of the week, past ones and today told apart', () => {
    const days = weekPlan(history(), input(goal()), '2026-11-12', NOW)
    expect(days.map(d => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
    expect(days.map(d => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(days.filter(d => d.past).length).toBe(3)
    expect(days.find(d => d.today)?.date).toBe('2026-11-12')
  })

  it('marks done, skipped and rest days, and plans the member’s days to come', () => {
    const outings = [...history(), run('2026-11-10', 7.4, 50)]
    const days = weekPlan(outings, input(goal({ outings_per_week: 4, preferred_days: [1, 4, 6, 7], long_run_day: 7 })), '2026-11-12', NOW)
    expect(days.map(d => d.state)).toEqual(['skipped', 'done', 'rest', 'planned', 'rest', 'planned', 'planned'])
    expect(days[1]).toMatchObject({ distanceM: 7400, movingS: 3000, session: null })
    expect(days.filter(d => d.session).map(d => d.date)).toEqual(['2026-11-12', '2026-11-14', '2026-11-15'])
  })

  it('spreads the outings left over the days left without chosen days, today first', () => {
    const days = weekPlan([...history(), run('2026-11-10')], input(goal({ outings_per_week: 3 })), '2026-11-12', NOW)
    // 3 a week, 1 run: 2 left over Thursday to Sunday
    expect(days.filter(d => d.state === 'planned').map(d => d.date)).toEqual(['2026-11-12', '2026-11-14'])
    expect(days[2]!.state).toBe('rest')
  })

  it('keeps today’s session once today’s outing is recorded', () => {
    const before = weekPlan(history(), input(goal()), '2026-11-12', NOW)[3]!
    const after = weekPlan([...history(), run('2026-11-12')], input(goal()), '2026-11-12', NOW)[3]!
    expect(after.state).toBe('done')
    expect(after.session?.plan.kind).toBe(before.session?.plan.kind)
  })

  it('never plans two demanding sessions in a row', () => {
    const days = weekPlan(history(), input(goal({ outings_per_week: 4, preferred_days: [4, 5, 6, 7] })), '2026-11-12', NOW)
    const kinds = days.map(d => d.session?.plan.kind)
    for (let i = 1; i < kinds.length; i++) {
      expect(KEY_SESSIONS.includes(kinds[i - 1]!) && KEY_SESSIONS.includes(kinds[i]!)).toBe(false)
    }
  })

  it('puts the long run on the member’s day, an hour and a half by default', () => {
    expect(defaultMinutes(goal({ long_run_day: 7 }), '2026-11-15')).toBe(LONG_RUN_MINUTES)
    expect(defaultMinutes(goal({ long_run_day: 7 }), '2026-11-14')).toBe(60)
    const days = weekPlan(history(), input(goal({ outings_per_week: 2, preferred_days: [4, 7], long_run_day: 7 })), '2026-11-12', NOW)
    expect(days[6]!.session).toMatchObject({ reason: 'longRunDay', plan: { kind: 'long' } })
  })

  it('keeps the week on its target, the sessions planned before a day counted', () => {
    const g = goal({ outings_per_week: 4, preferred_days: [4, 5, 6, 7] })
    const days = weekPlan(history(), input(g, () => ({ minutes: 120, other: 0 })), '2026-11-12', NOW)
    const planned = days.reduce((sum, d) => sum + (d.session ? sessionLoad(d.session.plan) : 0), 0)
    const week = weekVolume(history(), g, '2026-11-12')!
    // A session never goes under 20 min, hence the small margin
    expect(planned).toBeLessThanOrEqual(week.target + 0.5)
  })

  it('follows the duration chosen for a day', () => {
    const g = goal({ outings_per_week: 4, preferred_days: [4, 5, 6, 7] })
    const days = weekPlan(history(), input(g, date => (date === '2026-11-14' ? { minutes: 30, other: 0 } : null)), '2026-11-12', NOW)
    expect(days[5]!.session!.plan.minutes).toBeLessThanOrEqual(30)
  })
})

describe('daySession', () => {
  it('gives the planned session, or on a rest day the session of the day anyway', () => {
    const g = goal({ outings_per_week: 2, preferred_days: [4, 7] })
    const plan = weekPlan(history(), input(g), '2026-11-12', NOW)
    expect(daySession(history(), input(g), '2026-11-12', NOW)).toEqual(plan[3]!.session)
    expect(plan[4]!.session).toBeNull()
    expect(daySession(history(), input(g), '2026-11-13', NOW).plan.minutes).toBeGreaterThan(0)
  })
})
