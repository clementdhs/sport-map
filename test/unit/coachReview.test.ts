import { describe, expect, it } from 'vitest'
import { buildSession } from '#shared/utils/coachSessions'
import { formEffect, matchesSession, outingFeelingSchema, regularity, repeatTimes, tomorrowSession } from '#shared/utils/coachReview'
import { coachDays, outingDaysBefore, sessionOfTheDay, sessionOn } from '#shared/utils/coachSessions'
import type { OutingTrackPoint } from '#shared/utils/routes'
import { FEELING_FACTORS, type LoadOuting, outingLoad, trainingForm } from '#shared/utils/trainingForm'

const NOW = new Date('2026-11-09T10:00:00Z')
const M_PER_DEG = 111_195

// A test trace heading north, one point a second: each stretch runs `seconds` at `speed` m/s, climbing `grade`.
type Stretch = { seconds: number, speed: number, grade?: number }
function trace(stretches: Stretch[], { pauseAfter }: { pauseAfter?: number } = {}): OutingTrackPoint[] {
  const points: OutingTrackPoint[] = [[5, 45, 200, 0, 0]]
  let meters = 0
  let alt = 200
  let elapsed = 0
  let moving = 0
  stretches.forEach(({ seconds, speed, grade = 0 }, i) => {
    for (let s = 0; s < seconds; s++) {
      meters += speed
      alt += speed * grade
      elapsed++
      moving++
      points.push([5, 45 + meters / M_PER_DEG, alt, elapsed, moving])
    }
    // A stop: time goes on, moving time doesn't.
    if (i === pauseAfter) elapsed += 120
  })
  return points
}

describe('matchesSession', () => {
  const plan = buildSession('endurance', 60, 6)

  it('takes an outing within a quarter of the session time', () => {
    expect(matchesSession(plan, 60 * 60)).toBe(true)
    expect(matchesSession(plan, 46 * 60)).toBe(true)
    expect(matchesSession(plan, 75 * 60)).toBe(true)
    expect(matchesSession(plan, 44 * 60)).toBe(false)
    expect(matchesSession(plan, 80 * 60)).toBe(false)
  })

  it('takes an outing on the route traced for the session, whatever its time (#266)', () => {
    expect(matchesSession(plan, 30 * 60, true)).toBe(true)
    expect(matchesSession(plan, null, true)).toBe(true)
    expect(matchesSession(buildSession('rest', 0, 6), 3600, true)).toBe(false)
  })

  it('allows 10 min at least on short sessions', () => {
    const short = buildSession('recovery', 30, 6)
    expect(matchesSession(short, 21 * 60)).toBe(true)
    expect(matchesSession(short, 19 * 60)).toBe(false)
  })

  it('never matches a rest day or an outing without moving time', () => {
    expect(matchesSession(buildSession('rest', 0, 6), 3600)).toBe(false)
    expect(matchesSession(plan, null)).toBe(false)
  })
})

describe('repeatTimes', () => {
  it('times each hill of a short hill session', () => {
    const plan = buildSession('shortHills', 45, 6)
    const climbsS = [60, 62, 61, 70]
    const track = trace([
      { seconds: 600, speed: 2.8 },
      ...climbsS.flatMap(seconds => [
        { seconds, speed: 3, grade: 0.1 },
        // Back down the same height in 2 min
        { seconds: 120, speed: (3 * seconds) / 120, grade: -0.1 },
      ]),
      { seconds: 300, speed: 2.8 },
    ])
    const times = repeatTimes(track, plan)!
    expect(times.kind).toBe('hills')
    expect(times.values).toHaveLength(4)
    // The smoothing of elevations blurs each end by a few seconds, the same for every climb.
    times.values.forEach((value, i) => expect(Math.abs(value - climbsS[i]!)).toBeLessThanOrEqual(6))
    expect(times.values[3]! - times.values[0]!).toBeGreaterThanOrEqual(7)
  })

  it('keeps the largest climbs, as many as the session has', () => {
    const plan = buildSession('longHills', 30, 6)
    expect(plan.reps!.count).toBe(2)
    const track = trace([
      { seconds: 300, speed: 2.8 },
      // A small bump of the warm-up
      { seconds: 30, speed: 3, grade: 0.05 },
      { seconds: 30, speed: 3, grade: -0.05 },
      ...[180, 185].flatMap(seconds => [
        { seconds, speed: 3, grade: 0.07 },
        { seconds: 180, speed: 3, grade: -0.07 },
      ]),
    ])
    const values = repeatTimes(track, plan)!.values
    expect(values).toHaveLength(2)
    expect(Math.abs(values[0]! - 180)).toBeLessThanOrEqual(8)
    expect(Math.abs(values[1]! - 185)).toBeLessThanOrEqual(8)
  })

  it('leaves the stops out of a climb', () => {
    const plan = buildSession('shortHills', 45, 6)
    const track = trace([
      { seconds: 300, speed: 2.8 },
      { seconds: 30, speed: 3, grade: 0.1 },
      { seconds: 30, speed: 3, grade: 0.1 },
      { seconds: 120, speed: 1.5, grade: -0.1 },
      { seconds: 60, speed: 3, grade: 0.1 },
      { seconds: 120, speed: 1.5, grade: -0.1 },
    ], { pauseAfter: 1 })
    const values = repeatTimes(track, plan)!.values
    expect(Math.abs(values[0]! - values[1]!)).toBeLessThanOrEqual(3)
  })

  it('needs altitudes for hills', () => {
    const plan = buildSession('shortHills', 45, 6)
    const track = trace([{ seconds: 300, speed: 3, grade: 0.1 }]).map(([lng, lat, , e, m]) => [lng, lat, null, e, m] as OutingTrackPoint)
    expect(repeatTimes(track, plan)).toBeNull()
  })

  it('gives the pace of each interval', () => {
    const plan = buildSession('intervals', 30, 6)
    expect(plan.reps).toMatchObject({ count: 3, effortMin: 3 })
    // 4:10, 4:00 and 4:20 per km, with 2 min jogs at 7:00
    const paces = [250, 240, 260]
    const track = trace([
      { seconds: 600, speed: 1000 / 400 },
      ...paces.flatMap(pace => [{ seconds: 180, speed: 1000 / pace }, { seconds: 120, speed: 1000 / 420 }]),
      { seconds: 300, speed: 1000 / 400 },
    ])
    const times = repeatTimes(track, plan)!
    expect(times.kind).toBe('fast')
    times.values.forEach((value, i) => expect(Math.abs(value - paces[i]!)).toBeLessThanOrEqual(3))
  })

  it('has nothing to time in a session without repeats', () => {
    expect(repeatTimes(trace([{ seconds: 600, speed: 3 }]), buildSession('endurance', 60, 6))).toBeNull()
  })
})

describe('regularity', () => {
  it('compares the spread with the median', () => {
    expect(regularity([178, 184, 181, 192])).toEqual({ level: 'veryRegular', spread: 14, lastSlowest: true })
    expect(regularity([60, 68, 62])).toEqual({ level: 'regular', spread: 8, lastSlowest: false })
    expect(regularity([60, 75, 62])).toMatchObject({ level: 'irregular', spread: 15 })
    expect(regularity([60, 60])).toEqual({ level: 'veryRegular', spread: 0, lastSlowest: false })
  })
})

describe('feeling', () => {
  it('weighs the load, from × 0.8 to × 1.3', () => {
    const base = { distance_m: 10_000, elevation_gain_m: 100 }
    expect(outingLoad(base)).toBe(11)
    expect(outingLoad({ ...base, feeling: null })).toBe(11)
    expect(outingLoad({ ...base, feeling: 'easy' })).toBeCloseTo(8.8)
    expect(outingLoad({ ...base, feeling: 'very_hard' })).toBeCloseTo(14.3)
    expect(Object.values(FEELING_FACTORS)).toEqual([0.8, 1, 1.15, 1.3])
  })

  it('is validated', () => {
    expect(outingFeelingSchema.safeParse({ feeling: 'hard' }).success).toBe(true)
    expect(outingFeelingSchema.safeParse({ feeling: null }).success).toBe(true)
    expect(outingFeelingSchema.safeParse({ feeling: 'terrible' }).success).toBe(false)
  })
})

function outing(ago: number, km = 10, extra: Partial<LoadOuting> = {}): LoadOuting {
  return {
    sport_type: 'running',
    distance_m: km * 1000,
    elevation_gain_m: 0,
    completed_at: new Date(NOW.getTime() - ago * 86_400_000).toISOString(),
    ...extra,
  }
}
// Five weeks of 10 km every other day
const history = () => Array.from({ length: 18 }, (_, i) => outing(2 + i * 2))

describe('formEffect', () => {
  it('gives the form without the outing, then with it and its feeling', () => {
    const today = outing(0, 12)
    const outings = [today, ...history()]
    const effect = formEffect(outings, today, NOW)
    expect(effect.before).toBeCloseTo(trainingForm(history(), NOW).ratio!)
    expect(effect.after).toBeGreaterThan(effect.before!)
    expect(effect.state).toBe(trainingForm(outings, NOW).state)

    const hard = { ...today, feeling: 'very_hard' as const }
    expect(formEffect([hard, ...history()], hard, NOW).after).toBeGreaterThan(effect.after!)
  })

  it('has no ratio while learning', () => {
    const today = outing(0)
    expect(formEffect([today, outing(3)], today, NOW)).toEqual({ before: null, after: null, state: 'learning' })
  })
})

describe('tomorrowSession', () => {
  it('follows the rules on tomorrow\'s form, today\'s outing counted', () => {
    const input = { goal: null, easyPace: 6, choiceOf: () => null }
    const outings = [outing(0), ...history()]
    const plan = tomorrowSession(outings, input, NOW)
    // Tomorrow, today becomes one more outing day: the alternation moves on.
    const again = tomorrowSession([outing(0), outing(0, 1), ...history()], input, NOW)
    expect(again.kind).toBe(plan.kind)
    expect(plan.minutes).toBeGreaterThan(0)
  })

  it('rests after a heavy overload', () => {
    const outings = [outing(0, 60), outing(1, 60), ...history()]
    expect(tomorrowSession(outings, { goal: null, easyPace: 6, choiceOf: () => null }, NOW).kind).toBe('rest')
  })
})

describe('coachDays', () => {
  it('gives today and the next days the forecast covers, as French dates', () => {
    expect(coachDays(NOW)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'])
    // 00:30 in Paris is already the next day.
    expect(coachDays(new Date('2026-11-09T23:30:00Z'))[0]).toBe('2026-11-10')
  })

  it('skips no day when summer time starts', () => {
    // 23:30 in Paris on the eve of the 23-hour day
    expect(coachDays(new Date('2026-03-28T22:30:00Z'))).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'])
  })
})

describe('sessionOn', () => {
  const input = { goal: null, minutes: 60 as const, easyPace: 6 }

  it('gives today the session of the day', () => {
    const outings = [outing(1), ...history()]
    const form = trainingForm(outings, NOW)
    const today = sessionOfTheDay({
      ...input,
      state: form.state,
      ratio: form.ratio,
      outingDays: outingDaysBefore(outings, form.historyDays, NOW),
      today: '2026-11-09',
      weekly: form.weekly,
      longest: form.longest,
    })
    expect(sessionOn(outings, input, '2026-11-09')).toEqual(today)
  })

  it('gives a later day the session of its form, the outings until then among the days before', () => {
    const outings = [outing(0), ...history()]
    const later = trainingForm(outings, new Date('2026-11-12T12:00:00Z'))
    expect(sessionOn(outings, input, '2026-11-12')).toEqual(sessionOfTheDay({
      ...input,
      state: later.state,
      ratio: later.ratio,
      outingDays: outingDaysBefore(outings, later.historyDays, new Date('2026-11-12T12:00:00Z')),
      today: '2026-11-12',
      weekly: later.weekly,
      longest: later.longest,
    }))
  })

  it('walks through the other sessions with « Autre séance »', () => {
    const outings = [outing(1), ...history()]
    // The day of a key session, one outing day out of two
    const day = coachDays(NOW).find(date => sessionOn(outings, input, date).options > 1)
    expect(day).toBeDefined()
    const first = sessionOn(outings, input, day!)
    const kinds = new Set(Array.from({ length: first.options }, (_, i) => sessionOn(outings, input, day!, i).plan.kind))
    expect(kinds.size).toBe(first.options)
  })
})
