import { describe, expect, it } from 'vitest'
import {
  averageSpeed,
  currentSpeed,
  estimatedArrival,
  liveValue,
  parseLiveDataPrefs,
  type LiveStats,
} from '~/utils/liveStats'
import type { RecordedPoint } from '~/utils/recorder'

const METERS_PER_DEG_LAT = 111_195
const T0 = Date.UTC(2026, 8, 28, 8, 0, 0)

// A point `meters` north of the start, `seconds` after T0.
const point = (meters: number, seconds: number): RecordedPoint =>
  ({ lng: 6.12, lat: 45.9 + meters / METERS_PER_DEG_LAT, alt: null, t: T0 + seconds * 1000 })

const STATS: LiveStats = {
  now: T0,
  elapsedS: null,
  distanceM: null,
  remainingM: null,
  gainM: null,
  remainingGainM: null,
  speedMs: null,
  averageSpeedMs: null,
  arrivalAt: null,
}

describe('currentSpeed', () => {
  it('is the speed over the last 30 seconds', () => {
    // 2 m/s for two minutes, then 4 m/s for the last 30 s.
    const points = [0, 30, 60, 90, 120].map(s => point(s * 2, s))
    points.push(point(240 + 60, 135), point(240 + 120, 150))
    expect(currentSpeed(points, T0 + 150_000)).toBeCloseTo(4, 1)
  })

  it('drops when standing still, since no point is recorded then', () => {
    const points = [point(0, 0), point(60, 40)]
    expect(currentSpeed(points, T0 + 60_000)).toBeCloseTo(1, 1)
    expect(currentSpeed(points, T0 + 300_000)).toBe(0)
  })

  it('is unknown without points or during the first seconds', () => {
    expect(currentSpeed([], T0)).toBeNull()
    expect(currentSpeed([point(0, 0)], T0 + 2000)).toBeNull()
  })
})

describe('averageSpeed and estimatedArrival', () => {
  it('waits for a minute of moving', () => {
    expect(averageSpeed(100, 30_000)).toBeNull()
    expect(averageSpeed(300, 120_000)).toBe(2.5)
  })

  it('estimates the arrival at the average speed', () => {
    expect(estimatedArrival(T0, 3600, 2)).toBe(T0 + 1800_000)
    expect(estimatedArrival(T0, 3600, null)).toBeNull()
    expect(estimatedArrival(T0, 3600, 0.1)).toBeNull()
  })
})

describe('liveValue', () => {
  it('splits the value from its unit', () => {
    expect(liveValue('distance', { ...STATS, distanceM: 850.4 }, false, 'fr-FR')).toEqual({ value: '850', unit: 'm' })
    expect(liveValue('remaining', { ...STATS, remainingM: 12_345 }, false, 'fr-FR')).toEqual({ value: '12,35', unit: 'km' })
    expect(liveValue('remainingGain', { ...STATS, remainingGainM: 1234.6 }, false, 'en-GB')).toEqual({ value: '1,235', unit: 'm' })
    expect(liveValue('elapsed', { ...STATS, elapsedS: 3909 }, false, 'fr-FR')).toEqual({ value: '1:05:09' })
  })

  it('shows a speed or a pace', () => {
    const stats = { ...STATS, speedMs: 3, averageSpeedMs: 0.1 }
    expect(liveValue('speed', stats, false, 'fr-FR')).toEqual({ value: '10,8', unit: 'km/h' })
    expect(liveValue('speed', stats, true, 'fr-FR')).toEqual({ value: '5:33', unit: '/km' })
    // Too slow for a meaningful pace.
    expect(liveValue('averageSpeed', stats, true, 'fr-FR')).toEqual({ value: '—', unit: '/km' })
  })

  it('shows a dash for unknown values', () => {
    for (const field of ['elapsed', 'distance', 'gain', 'speed', 'arrival'] as const) {
      expect(liveValue(field, STATS, false, 'fr-FR').value).toBe('—')
    }
  })
})

describe('parseLiveDataPrefs', () => {
  it('keeps the known fields of each mode', () => {
    const raw = JSON.stringify({ follow: ['time', 'nope', 'remaining'], record: ['remaining', 'gain'], pace: true })
    expect(parseLiveDataPrefs(raw)).toEqual({ follow: ['remaining', 'time'], record: ['gain'], pace: true })
  })

  it('ignores a missing or damaged value', () => {
    expect(parseLiveDataPrefs(null)).toEqual({})
    expect(parseLiveDataPrefs('{oops')).toEqual({})
    expect(parseLiveDataPrefs('[1]')).toEqual({})
  })
})
