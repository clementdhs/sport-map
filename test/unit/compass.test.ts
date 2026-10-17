import { describe, expect, it } from 'vitest'
import { screenHeading, smoothCompass, type OrientationReading } from '~/utils/compass'

const reading = (alpha: number | null, beta: number | null = 0, gamma: number | null = 0, extra: Partial<OrientationReading> = {}): OrientationReading =>
  ({ alpha, beta, gamma, absolute: true, ...extra })

describe('screenHeading', () => {
  it('reads the heading of a phone lying flat in portrait (alpha turns counter-clockwise)', () => {
    expect(screenHeading(reading(0), 0)).toBeCloseTo(0)
    expect(screenHeading(reading(90), 0)).toBeCloseTo(270)
    expect(screenHeading(reading(270), 0)).toBeCloseTo(90)
  })

  it('stays right when the phone is tilted towards the walker or held upright', () => {
    expect(screenHeading(reading(90, 45), 0)).toBeCloseTo(270)
    expect(screenHeading(reading(90, 90), 0)).toBeCloseTo(270)
    expect(screenHeading(reading(30, 70), 0)).toBeCloseTo(330)
  })

  it('turns with the screen in landscape', () => {
    // Turned a quarter to the left, the top of the screen is the right edge of the phone.
    expect(screenHeading(reading(0), 90)).toBeCloseTo(90)
    expect(screenHeading(reading(0), 270)).toBeCloseTo(270)
    expect(screenHeading(reading(0, 0, -90), 90)).toBeCloseTo(90)
  })

  it('uses the alpha angle alone when the tilt is missing', () => {
    expect(screenHeading(reading(90, null, null), 0)).toBeCloseTo(270)
  })

  it('gives nothing for a reading that is not relative to north or has no value', () => {
    expect(screenHeading(reading(90, 0, 0, { absolute: false }), 0)).toBeNull()
    expect(screenHeading(reading(null, null, null), 0)).toBeNull()
  })

  it('gives nothing when the phone faces the ground at an angle that hides the direction', () => {
    expect(screenHeading(reading(0, 135), 0)).toBeNull()
  })

  it('uses the iOS compass heading, corrected for the screen angle', () => {
    const ios = (heading: number, accuracy = 10) =>
      reading(12, 0, 0, { absolute: false, webkitCompassHeading: heading, webkitCompassAccuracy: accuracy })
    expect(screenHeading(ios(80), 0)).toBe(80)
    expect(screenHeading(ios(300), 90)).toBe(30)
    expect(screenHeading(ios(80, -1), 0)).toBeNull()
  })
})

describe('smoothCompass', () => {
  it('starts from the first reading, then closes part of the gap with each one', () => {
    const first = smoothCompass(null, 90, 0)
    expect(first.deg).toBe(90)
    const next = smoothCompass(first, 100, 100)
    expect(next.deg).toBeGreaterThan(90)
    expect(next.deg).toBeLessThan(95)
  })

  it('turns the short way round north', () => {
    const next = smoothCompass(smoothCompass(null, 350, 0), 10, 400)
    expect(next.deg > 350 || next.deg < 10).toBe(true)
    expect(next.deg).not.toBeCloseTo(180, 0)
  })

  it('settles on a steady heading', () => {
    let state = smoothCompass(null, 0, 0)
    for (let t = 16; t <= 3000; t += 16) state = smoothCompass(state, 45, t)
    expect(state.deg).toBeCloseTo(45, 1)
  })

  it('takes the reading as is after a long gap', () => {
    expect(smoothCompass(smoothCompass(null, 0, 0), 120, 5000).deg).toBe(120)
  })
})
