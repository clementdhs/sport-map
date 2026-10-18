import { describe, expect, it } from 'vitest'
import {
  formatPaceSetting,
  outingFlatPace,
  PACE_SUGGESTION_OUTINGS,
  parsePaceSetting,
  parseSportPaces,
  suggestPaces,
  type PaceOuting,
} from '#shared/utils/pace'

// A GPS outing that covered its whole route: `km` at `paceMinPerKm` on the flat (gain left aside).
function outing(sport: PaceOuting['sport'], km: number, paceMinPerKm: number, extra: Partial<PaceOuting> = {}): PaceOuting {
  return {
    sport,
    hasTrack: true,
    distanceM: km * 1000,
    movingS: km * paceMinPerKm * 60,
    routeDistanceM: km * 1000,
    routeGainM: 0,
    ...extra,
  }
}

describe('parseSportPaces', () => {
  it('keeps the known sports with a pace a member could set', () => {
    expect(parseSportPaces({ running: 5.5, hiking: 15, road_cycling: 60 / 27 })).toEqual({ running: 5.5, hiking: 15, road_cycling: 60 / 27 })
  })

  it('leaves out anything else', () => {
    expect(parseSportPaces(undefined)).toEqual({})
    expect(parseSportPaces([5])).toEqual({})
    // 1:00/km running, 0.5 km/h hiking, a string, an unknown sport
    expect(parseSportPaces({ running: 1, hiking: 120, trail: '7', swimming: 2 })).toEqual({})
  })
})

describe('parsePaceSetting', () => {
  it('reads a pace in min/km for runners', () => {
    expect(parsePaceSetting('running', '5:30')).toBeCloseTo(5.5)
    expect(parsePaceSetting('trail', ' 7 ')).toBe(7)
    expect(parsePaceSetting('running', '4\'45')).toBeCloseTo(4.75)
  })

  it('reads a speed in km/h for the others, as a pace', () => {
    expect(parsePaceSetting('hiking', '4,5')).toBeCloseTo(60 / 4.5)
    expect(parsePaceSetting('road_cycling', '30')).toBe(2)
  })

  it('refuses what isn\'t one, or is out of bounds', () => {
    expect(parsePaceSetting('running', '5:75')).toBeNull()
    expect(parsePaceSetting('running', '5.5')).toBeNull()
    expect(parsePaceSetting('running', '1:30')).toBeNull()
    expect(parsePaceSetting('hiking', '12')).toBeNull()
    expect(parsePaceSetting('cycling', 'fast')).toBeNull()
    // Shown with one decimal: more would be used without being seen
    expect(parsePaceSetting('hiking', '4,55')).toBeNull()
  })
})

describe('formatPaceSetting', () => {
  it('writes a pace for runners, a speed for the others', () => {
    expect(formatPaceSetting('running', 6)).toBe('6:00')
    expect(formatPaceSetting('trail', 7.75)).toBe('7:45')
    expect(formatPaceSetting('hiking', 12)).toBe('5')
    expect(formatPaceSetting('hiking', 60 / 4.5, 'fr-FR')).toBe('4,5')
    expect(formatPaceSetting('road_cycling', 60 / 27.5, 'en-GB')).toBe('27.5')
  })
})

describe('outingFlatPace', () => {
  it('takes the climbing out of the moving time', () => {
    // 10 km in 72 min with 200 m of gain: 12 km-effort at 6:00/km
    expect(outingFlatPace(outing('running', 10, 7.2, { routeGainM: 200 }))).toBeCloseTo(6)
    // 12 km in 3 h 40 with 600 m of gain: 2 h 40 on the flat, so 4.5 km/h
    expect(outingFlatPace(outing('hiking', 12, 220 / 12, { routeGainM: 600 }))).toBeCloseTo(60 / 4.5)
  })

  it('counts the gain of the part of the route covered', () => {
    // Half of a 20 km route with 400 m of gain: 200 m climbed
    const half = outing('running', 10, 7.2, { routeDistanceM: 20_000, routeGainM: 400 })
    expect(outingFlatPace(half)).toBeCloseTo(6)
  })
})

describe('suggestPaces', () => {
  it('gives each sport the median pace of its outings, rounded as typed', () => {
    const outings = [
      outing('running', 10, 5.2),
      outing('running', 8, 5.6),
      outing('running', 12, 5.31),
      // 2:54 and 3:06 per km: 20 km/h
      outing('cycling', 40, 2.9),
      outing('cycling', 30, 3.1),
    ]
    expect(suggestPaces(outings)).toEqual({
      running: { pace: 5 + 20 / 60, outings: 3 },
      cycling: { pace: 3, outings: 2 },
    })
  })

  it('leaves out the outings without GPS points or too short', () => {
    const outings = [
      outing('trail', 15, 9),
      outing('trail', 15, 4, { hasTrack: false }),
      outing('trail', 0.8, 4),
      // 1.5 km in 4.5 min
      outing('trail', 1.5, 3),
    ]
    expect(suggestPaces(outings)).toEqual({ trail: { pace: 9, outings: 1 } })
  })

  it('leaves out paces no member could set, and gives nothing without outings', () => {
    // A recording left on in a car: 60 km/h on a hike
    expect(suggestPaces([outing('hiking', 30, 1)])).toEqual({})
    expect(suggestPaces([])).toEqual({})
  })

  it('only looks at the latest outings of each sport', () => {
    const latest = Array.from({ length: PACE_SUGGESTION_OUTINGS }, () => outing('running', 10, 5))
    expect(suggestPaces([...latest, outing('running', 10, 7), outing('running', 10, 7)]).running)
      .toEqual({ pace: 5, outings: PACE_SUGGESTION_OUTINGS })
  })
})
