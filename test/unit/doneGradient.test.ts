import { describe, expect, it } from 'vitest'
import { doneGradient } from '~/utils/routeLayers'

describe('doneGradient', () => {
  it('draws nothing before the start', () => {
    expect(doneGradient(0, 'done', 'track')).toBeNull()
    expect(doneGradient(Number.NaN, 'done', 'track')).toBeNull()
  })

  it('switches colour where the walker is, with strictly ascending stops', () => {
    const gradient = doneGradient(0.4, 'done', 'track')!
    expect(gradient.slice(3)).toEqual([0, 'done', 0.4, 'done', 0.4 + 1e-6, 'track', 1, 'track'])
    const stops = (doneGradient(0.999998, 'done', 'track')!.slice(3) as unknown[]).filter((_, index) => index % 2 === 0) as number[]
    expect(stops.every((stop, index) => index === 0 || stop > stops[index - 1]!)).toBe(true)
  })

  it('is all done at the end', () => {
    expect(doneGradient(1, 'done', 'track')!.slice(3)).toEqual([0, 'done', 1, 'done'])
  })
})
