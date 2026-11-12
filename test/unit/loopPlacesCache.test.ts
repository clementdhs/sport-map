import { describe, expect, it } from 'vitest'
import { destination, distance } from '@turf/turf'
import type { LngLat } from '#shared/utils/routes'
import { VIA_SEARCH_MAX_M } from '#shared/utils/loops'
import {
  isLoopPlacesFresh,
  LOOP_PLACES_TTL_DAYS,
  LOOP_VIA_CACHE_RADIUS_M,
  loopPlacesCacheKey,
  loopPlacesCell,
  MAX_LOOP_CACHED_PLACES,
  namedPlacesFromCell,
  nearestLoopPlaces,
} from '#shared/utils/loopPlacesCache'

const MEYLAN: LngLat = [5.7795, 45.2093]
const move = (from: LngLat, metres: number, bearing: number): LngLat =>
  destination(from, metres, bearing, { units: 'meters' }).geometry.coordinates as LngLat
const metres = (a: LngLat, b: LngLat) => distance(a, b, { units: 'meters' })
const DAY_MS = 24 * 3600_000

describe('loopPlacesCacheKey', () => {
  it('gives the same key to starts a few hundred metres apart in the same cell', () => {
    const centre = loopPlacesCell(MEYLAN)
    const near = move(centre, 300, 45)
    expect(loopPlacesCacheKey({ kind: 'peak' }, near)).toBe(loopPlacesCacheKey({ kind: 'peak' }, centre))
  })

  it('gives another key to a start several kilometres away', () => {
    const far = move(MEYLAN, 5000, 90)
    expect(loopPlacesCacheKey({ kind: 'peak' }, far)).not.toBe(loopPlacesCacheKey({ kind: 'peak' }, MEYLAN))
  })

  it('keeps peaks and water points apart', () => {
    expect(loopPlacesCacheKey({ kind: 'peak' }, MEYLAN)).not.toBe(loopPlacesCacheKey({ kind: 'water' }, MEYLAN))
  })

  it('keys a named place by its normalized core: articles, accents, case and generic words aside', () => {
    const said = loopPlacesCacheKey({ kind: 'named', name: 'le massif de la Chartreuse', language: 'fr' }, MEYLAN)
    expect(said).toBe(loopPlacesCacheKey({ kind: 'named', name: 'MASSIF Chartreuse', language: 'fr' }, MEYLAN))
    expect(loopPlacesCacheKey({ kind: 'named', name: "l'Isère", language: 'fr' }, MEYLAN))
      .toBe(loopPlacesCacheKey({ kind: 'named', name: 'isere', language: 'fr' }, MEYLAN))
  })

  it('keeps two names apart, and a name apart from the peaks', () => {
    const chartreuse = loopPlacesCacheKey({ kind: 'named', name: 'Chartreuse', language: 'fr' }, MEYLAN)
    expect(chartreuse).not.toBe(loopPlacesCacheKey({ kind: 'named', name: 'Vercors', language: 'fr' }, MEYLAN))
    expect(chartreuse).not.toBe(loopPlacesCacheKey({ kind: 'peak' }, MEYLAN))
  })

  it('keeps a name said with its kind apart from the bare name: they ask different sources', () => {
    const bare = loopPlacesCacheKey({ kind: 'named', name: 'Chartreuse', language: 'fr' }, MEYLAN)
    expect(loopPlacesCacheKey({ kind: 'named', name: 'village Chartreuse', language: 'fr' }, MEYLAN)).not.toBe(bare)
    expect(loopPlacesCacheKey({ kind: 'named', name: 'massif de la Chartreuse', language: 'fr' }, MEYLAN)).not.toBe(bare)
  })

  it('keeps the languages apart: the geocoders name places in it', () => {
    expect(loopPlacesCacheKey({ kind: 'named', name: 'Genève', language: 'fr' }, MEYLAN))
      .not.toBe(loopPlacesCacheKey({ kind: 'named', name: 'Genève', language: 'en' }, MEYLAN))
  })

  it('has no key for a place said by its kind only', () => {
    expect(loopPlacesCacheKey({ kind: 'named', name: 'le lac', language: 'fr' }, MEYLAN)).toBeNull()
  })

  it('works on both sides of the Greenwich meridian and the equator', () => {
    const west: LngLat = [-0.005, -0.005]
    const east: LngLat = [0.005, 0.005]
    expect(loopPlacesCacheKey({ kind: 'peak' }, west)).not.toBe(loopPlacesCacheKey({ kind: 'peak' }, east))
    expect(loopPlacesCell(west)[0]).toBeLessThan(0)
    expect(loopPlacesCell(east)[0]).toBeGreaterThan(0)
  })
})

describe('loopPlacesCell', () => {
  it('is the centre of a cell holding the start, within a couple of kilometres', () => {
    const centre = loopPlacesCell(MEYLAN)
    expect(metres(centre, MEYLAN)).toBeLessThan(1600)
    expect(loopPlacesCell(centre)).toEqual(centre)
  })

  it('searches far enough around the cell centre for any start in it to see its whole reach', () => {
    const centre = loopPlacesCell(MEYLAN)
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const start = move(centre, 1100, bearing)
      if (loopPlacesCacheKey({ kind: 'peak' }, start) !== loopPlacesCacheKey({ kind: 'peak' }, centre)) continue
      expect(metres(centre, start) + VIA_SEARCH_MAX_M).toBeLessThanOrEqual(LOOP_VIA_CACHE_RADIUS_M)
    }
  })
})

describe('isLoopPlacesFresh', () => {
  const now = Date.parse('2026-11-12T10:00:00Z')

  it('keeps an answer for about a month', () => {
    expect(LOOP_PLACES_TTL_DAYS).toBe(30)
    expect(isLoopPlacesFresh(new Date(now - 29 * DAY_MS).toISOString(), now)).toBe(true)
  })

  it('asks again for an answer older than its lifetime', () => {
    expect(isLoopPlacesFresh(new Date(now - 31 * DAY_MS).toISOString(), now)).toBe(false)
  })

  it('takes an unreadable date as stale', () => {
    expect(isLoopPlacesFresh('not a date', now)).toBe(false)
  })
})

describe('nearestLoopPlaces', () => {
  it('keeps the places nearest to the cell centre when there are too many to keep', () => {
    const centre = loopPlacesCell(MEYLAN)
    const places = Array.from({ length: MAX_LOOP_CACHED_PLACES + 1 }, (_, i) => ({ id: `n${i}`, coordinates: move(centre, 10_000 - i, 90) }))
    const kept = nearestLoopPlaces(places, centre)
    expect(kept).toHaveLength(MAX_LOOP_CACHED_PLACES)
    expect(kept.some(place => place.id === 'n0')).toBe(false)
  })
})

describe('namedPlacesFromCell', () => {
  it('measures the cached places from the actual start, not the cell centre', () => {
    const start = move(loopPlacesCell(MEYLAN), 800, 0)
    const peak = move(start, 4000, 90)
    const [place] = namedPlacesFromCell([{ id: 'n1', name: 'Mont', kind: 'peak', coordinates: peak, distanceM: 1 }], start)
    expect(place!.distanceM).toBeGreaterThan(3990)
    expect(place!.distanceM).toBeLessThan(4010)
    expect(place!.coordinates).toEqual(peak)
  })
})
