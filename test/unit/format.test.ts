import { describe, expect, it } from 'vitest'
import { formatDate, formatDistance, formatDuration } from '~/utils/format'

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
