import { describe, expect, it } from 'vitest'
import { buildSession } from '#shared/utils/coachSessions'
import type { LngLat } from '#shared/utils/routes'
import type { Climb } from '#shared/utils/slopes'
import { climbsSummary, rankForSession, sessionClimbs, sessionGainPerKm, sessionHill, trackStretch } from '#shared/utils/sessionRoute'

const M_PER_DEG = 111_195

// A test track heading north, a point every 10 m: each stretch is `meters` long at `grade` %.
function track(stretches: { meters: number, grade?: number }[]): { coordinates: LngLat[], elevations: number[] } {
  const coordinates: LngLat[] = [[5, 45]]
  const elevations = [200]
  let along = 0
  let alt = 200
  for (const { meters, grade = 0 } of stretches) {
    for (let m = 0; m < meters; m += 10) {
      along += 10
      alt += grade / 10
      coordinates.push([5, 45 + along / M_PER_DEG])
      elevations.push(alt)
    }
  }
  return { coordinates, elevations }
}

// `count` hills of `meters` at `grade` %, each followed by the same way down and a flat stretch.
function hills(count: number, meters: number, grade: number) {
  const stretches = [{ meters: 1000 }]
  for (let i = 0; i < count; i++) stretches.push({ meters, grade }, { meters, grade: -grade }, { meters: 500 })
  return track(stretches)
}

const climb = (startM: number, endM: number, averageGrade: number): Climb => ({ startM, endM, gainM: ((endM - startM) * averageGrade) / 100, averageGrade })
const proposal = (seed: number, distanceM: number, gainM: number, climbs: Climb[] | null = null, status = 'ready') =>
  ({ seed, status, distanceM, gainM, climbs })

describe('sessionHill', () => {
  it('gives one effort of the hill repeats: its length, grade and count', () => {
    const hill = sessionHill(buildSession('longHills', 60, 6))!
    expect(hill.grade).toBeCloseTo(7)
    expect(hill.lengthM).toBeGreaterThan(300)
    expect(hill.lengthM).toBeLessThan(400)
    expect(hill.count).toBeGreaterThanOrEqual(2)
    expect(sessionHill(buildSession('shortHills', 45, 6))!.grade).toBeCloseTo(10)
  })

  it('is null for sessions without hill repeats', () => {
    expect(sessionHill(buildSession('endurance', 60, 6))).toBeNull()
    expect(sessionHill(buildSession('intervals', 60, 6))).toBeNull()
    expect(sessionHill(buildSession('longHilly', 90, 6))).toBeNull()
  })
})

describe('sessionClimbs', () => {
  const hill = { lengthM: 350, grade: 7, count: 4 }

  it('finds the climbs long and steep enough, in order', () => {
    const { coordinates, elevations } = hills(4, 400, 7)
    const found = sessionClimbs(coordinates, elevations, hill)
    expect(found).toHaveLength(4)
    expect(found.map(c => c.startM)).toEqual([...found.map(c => c.startM)].sort((a, b) => a - b))
    found.forEach(c => expect(c.averageGrade).toBeGreaterThan(5))
  })

  it('leaves out climbs too short or too gentle', () => {
    expect(sessionClimbs(...Object.values(hills(3, 150, 7)) as [LngLat[], number[]], hill)).toHaveLength(0)
    expect(sessionClimbs(...Object.values(hills(3, 400, 3)) as [LngLat[], number[]], hill)).toHaveLength(0)
  })

  it('keeps a longer or steeper climb: the member runs the effort on part of it', () => {
    const { coordinates, elevations } = hills(1, 1200, 9)
    expect(sessionClimbs(coordinates, elevations, hill)).toHaveLength(1)
  })

  it('finds short steep hills under the default dip tolerance', () => {
    const short = sessionHill(buildSession('shortHills', 45, 6))!
    const { coordinates, elevations } = hills(5, short.lengthM + 30, 11)
    expect(sessionClimbs(coordinates, elevations, short).length).toBeGreaterThanOrEqual(4)
  })

  it('gives nothing without elevations matching the track', () => {
    const { coordinates } = hills(2, 400, 7)
    expect(sessionClimbs(coordinates, [], hill)).toEqual([])
  })
})

describe('rankForSession', () => {
  it('ranks by gain per km against the session for a session without hills', () => {
    const plan = buildSession('endurance', 60, 6)
    expect(sessionGainPerKm(plan)).toBeCloseTo(5, 0)
    const ranked = rankForSession([proposal(1, 10_000, 300), proposal(2, 10_000, 60), proposal(3, 10_000, 150)], plan)
    expect(ranked.map(p => p.seed)).toEqual([2, 3, 1])
  })

  it('puts first the loops with the climbs the hill session needs, then the closest gain', () => {
    const plan = buildSession('longHills', 60, 6)
    const count = sessionHill(plan)!.count
    const enough = Array.from({ length: count }, (_, i) => climb(i * 1000, i * 1000 + 400, 7))
    const ranked = rankForSession([
      proposal(1, 9000, plan.gainM, [climb(0, 400, 7)]),
      proposal(2, 9000, plan.gainM * 3, enough),
      proposal(3, 9000, plan.gainM * 2, enough),
      proposal(4, 9000, plan.gainM, null, 'failed'),
    ], plan)
    expect(ranked.map(p => p.seed)).toEqual([3, 2, 1, 4])
  })

  it('counts more climbs than repeats as enough', () => {
    const plan = buildSession('longHills', 60, 6)
    const count = sessionHill(plan)!.count
    const many = Array.from({ length: count + 2 }, (_, i) => climb(i * 1000, i * 1000 + 400, 7))
    const exact = many.slice(0, count)
    const ranked = rankForSession([proposal(1, 9000, plan.gainM * 2, many), proposal(2, 9000, plan.gainM, exact)], plan)
    expect(ranked.map(p => p.seed)).toEqual([2, 1])
  })

  it('still proposes the best loop when none has climbs', () => {
    const plan = buildSession('shortHills', 45, 6)
    const ranked = rankForSession([proposal(1, 7000, 20, []), proposal(2, 7000, 120, [])], plan)
    expect(ranked.map(p => p.seed)).toEqual([2, 1])
  })
})

describe('climbsSummary', () => {
  it('gives the count, the mean length by 50 m and the mean grade', () => {
    expect(climbsSummary([climb(0, 380, 6.6), climb(1000, 1440, 7.6)])).toEqual({ count: 2, lengthM: 400, grade: 7 })
    expect(climbsSummary([])).toBeNull()
  })
})

describe('trackStretch', () => {
  it('keeps the points between two distances along the track', () => {
    const { coordinates } = track([{ meters: 100 }])
    expect(trackStretch(coordinates, 30, 60)).toHaveLength(4)
  })
})
