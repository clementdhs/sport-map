import { describe, expect, it } from 'vitest'
import { formatDate, formatDistance, formatTime, formatDuration, formatElapsed, formatNumber, formatPace, formatRating, formatSpeed, formatStopwatch, initials } from '#shared/utils/format'

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

  it('formats a pace in minutes per km, or a dash when too slow', () => {
    expect(formatPace(1000 / 312)).toBe('5:12')
    expect(formatPace(1000 / 59.6)).toBe('1:00')
    expect(formatPace(0.2)).toBe('—')
  })
})

describe('in English', () => {
  it('uses the English separators and month names', () => {
    expect(formatDistance(12_345, 'en-GB')).toBe('12.35 km')
    expect(formatRating(4.333, 'en-GB')).toBe('4.3')
    expect(formatSpeed(8400, 3600, 'en-GB')).toBe('8.4 km/h')
    expect(formatDate('2026-09-27T23:30:00Z', 'en-GB')).toBe('28 September 2026')
    expect(formatNumber(1250, 'en-GB')).toBe('1,250')
  })
})

describe('formatTime', () => {
  it('gives the time of day in France, whatever the server time zone', () => {
    expect(formatTime('2026-10-04T12:05:00Z')).toBe('14:05')
    expect(formatTime('2026-12-04T08:30:00Z', 'en-GB')).toBe('09:30')
  })
})

describe('initials', () => {
  it('takes the first letter of the first two words, in capitals', () => {
    expect(initials('Marie-Claire Dupont')).toBe('MD')
    expect(initials('  jean   de la Fontaine ')).toBe('JD')
    expect(initials('clem')).toBe('C')
    expect(initials('Élodie')).toBe('É')
  })
})
