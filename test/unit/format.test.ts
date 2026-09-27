import { describe, expect, it } from 'vitest'
import { formatDate, formatDistance, formatDuration, formatElapsed, formatRating, formatSpeed, formatStopwatch } from '#shared/utils/format'

describe('formatDistance', () => {
  it('uses meters under 1 km', () => {
    expect(formatDistance(850.4)).toBe('850 m')
  })

  it('uses kilometers with 2 decimals from 1 km', () => {
    expect(formatDistance(12_345)).toBe('12,35 km')
    expect(formatDistance(1000)).toBe('1,00 km')
  })
})

describe('formatDuration', () => {
  it.each([
    [3, '5 min'],
    [44, '45 min'],
    [120, '2 h'],
    [123, '2 h 05'],
    [679.96, '11 h 20'],
  ])('%s min → %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected)
  })
})

describe('formatDate', () => {
  it('uses the Paris time zone, so server and browser agree', () => {
    // 23:30 UTC is already the next day in Paris.
    expect(formatDate('2026-09-27T23:30:00Z')).toBe('28 septembre 2026')
  })
})

describe('formatRating', () => {
  it('keeps one decimal, French style', () => {
    expect(formatRating(4.333)).toBe('4,3')
    expect(formatRating(5)).toBe('5,0')
    expect(formatRating(3.75)).toBe('3,8')
  })
})

describe('outing times', () => {
  it('formats a stopwatch', () => {
    expect(formatStopwatch(0)).toBe('00:00')
    expect(formatStopwatch(309.7)).toBe('05:09')
    expect(formatStopwatch(3909)).toBe('1:05:09')
  })

  it('formats a measured time to the minute', () => {
    expect(formatElapsed(42 * 60 + 20)).toBe('42 min')
    expect(formatElapsed(3900)).toBe('1 h 05')
    expect(formatElapsed(12.4)).toBe('12 s')
  })

  it('formats a speed in km/h', () => {
    expect(formatSpeed(8400, 3600)).toBe('8,4 km/h')
    expect(formatSpeed(1000, 0)).toBe('0,0 km/h')
  })
})
