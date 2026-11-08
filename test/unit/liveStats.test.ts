import { describe, expect, it } from 'vitest'
import { estimateDurationMin } from '#shared/utils/routes'
import {
  averageSpeed,
  currentLap,
  currentSpeed,
  estimatedArrival,
  liveValue,
  maxSpeedTracker,
  MODE_FIELDS,
  moveField,
  parseLiveDataPrefs,
  remainingDurationMin,
  toggleField,
  type LiveStats,
} from '~/utils/liveStats'
import { markLap, startRecording, type RecordedPoint } from '~/utils/recorder'

const METERS_PER_DEG_LAT = 111_195
const T0 = Date.UTC(2026, 8, 28, 8, 0, 0)

// A point `meters` north of the start, `seconds` after T0.
const point = (meters: number, seconds: number): RecordedPoint =>
  ({ lng: 6.12, lat: 45.9 + meters / METERS_PER_DEG_LAT, alt: null, t: T0 + seconds * 1000 })

const STATS: LiveStats = {
  now: T0,
  elapsedS: null,
  movingS: null,
  lapElapsedS: null,
  lapDistanceM: null,
  distanceM: null,
  remainingM: null,
  gainM: null,
  remainingGainM: null,
  lossM: null,
  altitudeM: null,
  speedMs: null,
  averageSpeedMs: null,
  maxSpeedMs: null,
  arrivalAt: null,
  lapNumber: null,
  batteryLevel: null,
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

describe('maxSpeedTracker', () => {
  // 2 m/s for a minute, 5 m/s for the next minute, then 1 m/s: a point every 10 s.
  const points: RecordedPoint[] = [point(0, 0)]
  const speeds = [...Array(6).fill(2), ...Array(6).fill(5), ...Array(6).fill(1)] as number[]
  speeds.forEach((speed, i) => {
    const last = points.at(-1)!
    points.push({ ...point(0, (i + 1) * 10), lat: last.lat + (speed * 10) / METERS_PER_DEG_LAT })
  })

  it('keeps the highest speed over 30 s, measured once per new point', () => {
    const maxSpeed = maxSpeedTracker()
    expect(maxSpeed(points.slice(0, 3))).toBeNull() // 20 s only
    expect(maxSpeed(points.slice(0, 7))).toBeCloseTo(2, 1)
    // Grown one point at a time, like an outing, or all at once: the same result.
    for (let n = 8; n <= points.length; n++) maxSpeed(points.slice(0, n))
    expect(maxSpeed(points)).toBeCloseTo(5, 1)
    expect(maxSpeedTracker()(points)).toBeCloseTo(5, 1)
  })

  it('starts over with another outing', () => {
    const maxSpeed = maxSpeedTracker()
    expect(maxSpeed(points)).toBeCloseTo(5, 1)
    const slow = [point(0, 0), point(30, 30), point(60, 60)]
    expect(maxSpeed(slow)).toBeCloseTo(1, 1)
    expect(maxSpeed([])).toBeNull()
  })

  it('isn\'t raised by the move across a pause', () => {
    // 300 m between two points 10 min apart (a pause): 0.5 m/s, not more.
    expect(maxSpeedTracker()([point(0, 0), point(300, 600)])).toBeCloseTo(0.5, 1)
  })
})

describe('currentLap', () => {
  it('counts from the start, then from the last press on "Tour"', () => {
    let recording = { ...startRecording(T0), distanceM: 1200 }
    expect(currentLap(recording, T0 + 300_000)).toEqual({ number: 1, elapsedS: 300, distanceM: 1200 })
    recording = markLap(recording, T0 + 300_000)
    recording = { ...recording, distanceM: 1500 }
    expect(currentLap(recording, T0 + 360_000)).toEqual({ number: 2, elapsedS: 60, distanceM: 300 })
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

  it('shows the values added in #181', () => {
    const stats = { ...STATS, movingS: 600, lapElapsedS: 75, lapDistanceM: 1530, lossM: 312.4, altitudeM: 1834.6, batteryLevel: 0.564 }
    expect(liveValue('movingTime', stats, false, 'fr-FR')).toEqual({ value: '10:00' })
    expect(liveValue('lapTime', stats, false, 'fr-FR')).toEqual({ value: '01:15' })
    expect(liveValue('lapDistance', stats, false, 'fr-FR')).toEqual({ value: '1,53', unit: 'km' })
    expect(liveValue('loss', stats, false, 'fr-FR')).toEqual({ value: '312', unit: 'm' })
    expect(liveValue('altitude', stats, false, 'en-GB')).toEqual({ value: '1,835', unit: 'm' })
    expect(liveValue('battery', stats, false, 'fr-FR')).toEqual({ value: '56', unit: '%' })
    expect(liveValue('maxSpeed', { ...stats, maxSpeedMs: 10 }, false, 'fr-FR')).toEqual({ value: '36,0', unit: 'km/h' })
  })

  it('shows a speed or a pace', () => {
    const stats = { ...STATS, speedMs: 3, averageSpeedMs: 0.1 }
    expect(liveValue('speed', stats, false, 'fr-FR')).toEqual({ value: '10,8', unit: 'km/h' })
    expect(liveValue('speed', stats, true, 'fr-FR')).toEqual({ value: '5:33', unit: '/km' })
    // Too slow for a meaningful pace.
    expect(liveValue('averageSpeed', stats, true, 'fr-FR')).toEqual({ value: '—', unit: '/km' })
  })

  it('shows a dash for unknown values', () => {
    const fields = ['elapsed', 'movingTime', 'lapTime', 'distance', 'lapDistance', 'gain', 'loss', 'altitude', 'speed', 'maxSpeed', 'arrival', 'battery'] as const
    for (const field of fields) {
      expect(liveValue(field, STATS, false, 'fr-FR').value).toBe('—')
    }
  })
})

describe('MODE_FIELDS', () => {
  it('leaves what is left of a route out of recording', () => {
    expect(MODE_FIELDS.record).not.toContain('remaining')
    expect(MODE_FIELDS.record).not.toContain('arrival')
    expect(MODE_FIELDS.record).toContain('lapTime')
    expect(MODE_FIELDS.follow).toContain('remainingGain')
  })
})

describe('parseLiveDataPrefs', () => {
  it('keeps the known fields of each mode, in their saved order', () => {
    const saved = { follow: ['time', 'nope', 'remaining', 'time'], record: ['remaining', 'maxSpeed', 'gain'], pace: true }
    expect(parseLiveDataPrefs(saved)).toEqual({ follow: ['time', 'remaining'], record: ['maxSpeed', 'gain'], pace: true })
  })

  it('ignores a missing or damaged value', () => {
    expect(parseLiveDataPrefs(null)).toEqual({})
    expect(parseLiveDataPrefs('{oops')).toEqual({})
    expect(parseLiveDataPrefs([1])).toEqual({})
  })
})

describe('toggleField and moveField', () => {
  it('adds a value last and removes one in place', () => {
    expect(toggleField(['distance', 'speed'], 'time', true)).toEqual(['distance', 'speed', 'time'])
    expect(toggleField(['distance', 'speed', 'time'], 'speed', false)).toEqual(['distance', 'time'])
    expect(toggleField(['distance', 'speed'], 'speed', true)).toEqual(['distance', 'speed'])
  })

  it('moves a value one place, not past the ends', () => {
    expect(moveField(['distance', 'speed', 'time'], 2, -1)).toEqual(['distance', 'time', 'speed'])
    expect(moveField(['distance', 'speed', 'time'], 0, 1)).toEqual(['speed', 'distance', 'time'])
    expect(moveField(['distance', 'speed'], 0, -1)).toEqual(['distance', 'speed'])
    expect(moveField(['distance', 'speed'], 1, 1)).toEqual(['distance', 'speed'])
  })
})

describe('remainingDurationMin', () => {
  it('uses the average moving speed once known', () => {
    // 3 km at 2 m/s: 25 min
    expect(remainingDurationMin('hiking', 3000, 300, 2)).toBeCloseTo(25)
  })

  it('falls back on the route estimate, with the member pace when given', () => {
    expect(remainingDurationMin('trail', 5000, 100, null, 6)).toBeCloseTo(estimateDurationMin('trail', 5000, 100, 6))
    expect(remainingDurationMin('hiking', 5000, null, 0.1)).toBeCloseTo(estimateDurationMin('hiking', 5000, null))
  })
})
