import { describe, expect, it } from 'vitest'
import { NO_HEADING, type HeadingState } from '~/utils/heading'
import {
  angleBetween,
  COURSE_FRESH_MS,
  MIN_ROTATION_DEG,
  nextMapBearing,
  parseMapOrientation,
  shouldRotate,
  travelDirection,
} from '~/utils/mapOrientation'

const NOW = Date.UTC(2026, 9, 17, 8, 0, 0)
const course = (headingDeg: number | null, agoMs = 0): HeadingState =>
  ({ headingDeg, measuredAt: NOW - agoMs, anchor: null })

describe('parseMapOrientation', () => {
  it('keeps north up unless the heading-up map was chosen', () => {
    expect(parseMapOrientation('heading')).toBe('heading')
    expect(parseMapOrientation('north')).toBe('north')
    expect(parseMapOrientation(null)).toBe('north')
    expect(parseMapOrientation('whatever')).toBe('north')
  })
})

describe('travelDirection', () => {
  it('follows the GPS course while moving, even with a compass', () => {
    expect(travelDirection(course(90), 1.4, 200, NOW)).toBe(90)
    // Speed unknown (Playwright, some browsers): a course just measured means moving.
    expect(travelDirection(course(90, 3000), null, 200, NOW)).toBe(90)
  })

  it('uses the compass when slow or stopped', () => {
    expect(travelDirection(course(90), 0.3, 200, NOW)).toBe(200)
    expect(travelDirection(course(90, COURSE_FRESH_MS + 1000), null, 200, NOW)).toBe(200)
    expect(travelDirection(NO_HEADING, null, 200, NOW)).toBe(200)
  })

  it('keeps the last course when stopped without a compass', () => {
    expect(travelDirection(course(90, COURSE_FRESH_MS + 1000), 0, null, NOW)).toBe(90)
    expect(travelDirection(NO_HEADING, null, null, NOW)).toBeNull()
  })
})

describe('nextMapBearing', () => {
  it('aims straight at the direction when following starts', () => {
    expect(nextMapBearing(null, 135, NOW)).toEqual({ deg: 135, at: NOW })
  })

  it('turns gradually, the short way round', () => {
    const start = nextMapBearing(null, 350, NOW)
    const next = nextMapBearing(start, 30, NOW + 1000)
    // 63 % of the 40° gap after a second, through north.
    expect(angleBetween(next.deg, 350 + 0.632 * 40)).toBeLessThan(1)
  })

  it('catches up after a long while', () => {
    const next = nextMapBearing(nextMapBearing(null, 90, NOW), 270, NOW + 15_000)
    expect(angleBetween(next.deg, 270)).toBeLessThan(0.01)
  })
})

describe('shouldRotate', () => {
  it('ignores small changes, so the map does not shake', () => {
    expect(shouldRotate(10, 10 + MIN_ROTATION_DEG - 1)).toBe(false)
    expect(shouldRotate(10, 10 + MIN_ROTATION_DEG)).toBe(true)
    expect(shouldRotate(-178, 179)).toBe(false)
    expect(shouldRotate(0, 180)).toBe(true)
  })
})

describe('angleBetween', () => {
  it('measures the smallest angle between two bearings', () => {
    expect(angleBetween(350, 10)).toBe(20)
    expect(angleBetween(-90, 270)).toBe(0)
    expect(angleBetween(0, 180)).toBe(180)
  })
})
