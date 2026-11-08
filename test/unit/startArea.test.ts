import { describe, expect, it } from 'vitest'
import { parseStartArea, placeAt, startAreaFromPlace } from '~/utils/startArea'

describe('startAreaFromPlace', () => {
  it('frames a place with its own extent', () => {
    expect(startAreaFromPlace({ center: [3.06, 50.63], bbox: [2.97, 50.58, 3.13, 50.68] }, 'Lille, France'))
      .toEqual({ bounds: [2.97, 50.58, 3.13, 50.68], name: 'Lille, France' })
  })

  it('frames a few kilometres around a place without one', () => {
    const { bounds } = startAreaFromPlace({ center: [6.86, 45.83] }, 'Mont Blanc')
    const [west, south, east, north] = bounds
    expect((north - south) / 2 * 111.32).toBeCloseTo(3)
    // Degrees of longitude are shorter away from the equator: the box stays about square on the ground.
    expect((east - west) / 2 * 111.32 * Math.cos(45.83 * Math.PI / 180)).toBeCloseTo(3)
    expect((west + east) / 2).toBeCloseTo(6.86)
  })

  it('frames around the centre a place whose extent is a point or crosses the antimeridian', () => {
    const point = startAreaFromPlace({ center: [6.86, 45.83], bbox: [6.86, 45.83, 6.86, 45.83] }, 'Mont Blanc')
    expect(point.bounds[0]).toBeLessThan(point.bounds[2])
    expect(point.bounds[1]).toBeLessThan(point.bounds[3])
    const fiji = startAreaFromPlace({ center: [178, -17.8], bbox: [177, -20.7, -178, -12.4] }, 'Fiji')
    expect(fiji.bounds[0]).toBeLessThan(fiji.bounds[2])
  })

  it('stays within the world near its edges', () => {
    const { bounds } = startAreaFromPlace({ center: [179.99, 89.99] }, 'Far away')
    expect(bounds[2]).toBe(180)
    expect(bounds[3]).toBe(90)
  })
})

describe('parseStartArea', () => {
  it('keeps an area of the world, named or not', () => {
    expect(parseStartArea({ bounds: [2.97, 50.58, 3.13, 50.68], name: 'Lille' }))
      .toEqual({ bounds: [2.97, 50.58, 3.13, 50.68], name: 'Lille' })
    expect(parseStartArea({ bounds: [2.97, 50.58, 3.13, 50.68], name: null }))
      .toEqual({ bounds: [2.97, 50.58, 3.13, 50.68], name: null })
    expect(parseStartArea({ bounds: [2.97, 50.58, 3.13, 50.68], name: '  ' })?.name).toBeNull()
    expect(parseStartArea({ bounds: [2.97, 50.58, 3.13, 50.68], name: ' Lille ' })?.name).toBe('Lille')
  })

  it('has none by default, or for anything damaged', () => {
    expect(parseStartArea(undefined)).toBeNull()
    expect(parseStartArea(null)).toBeNull()
    expect(parseStartArea('Lille')).toBeNull()
    expect(parseStartArea({ bounds: [2.97, 50.58, 3.13] })).toBeNull()
    expect(parseStartArea({ bounds: [2.97, 50.58, 3.13, 'north'] })).toBeNull()
    expect(parseStartArea({ bounds: [3.13, 50.58, 2.97, 50.68] })).toBeNull()
    expect(parseStartArea({ bounds: [-200, 50.58, 3.13, 50.68] })).toBeNull()
    expect(parseStartArea({ bounds: [2.97, 50.58, 3.13, 95] })).toBeNull()
  })
})

describe('placeAt', () => {
  const lille = { bounds: [2.97, 50.58, 3.13, 50.68] as [number, number, number, number], name: 'Lille' }
  const picked = { bounds: [3.0, 50.6, 3.1, 50.65] as [number, number, number, number], name: 'Citadelle' }

  it('names the first area holding the centre', () => {
    expect(placeAt([3.05, 50.63], [picked, lille])?.name).toBe('Citadelle')
    expect(placeAt([2.98, 50.59], [picked, lille])?.name).toBe('Lille')
  })

  it('names nothing elsewhere, nor an area taken from a map view', () => {
    expect(placeAt([6.86, 45.83], [picked, lille])).toBeNull()
    expect(placeAt([3.05, 50.63], [{ ...lille, name: null }, null, undefined])).toBeNull()
  })
})
