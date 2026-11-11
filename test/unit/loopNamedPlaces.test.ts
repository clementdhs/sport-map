import { describe, expect, it } from 'vitest'
import { bearing, destination, distance } from '@turf/turf'
import {
  loopRoutePoints,
  NAMED_PLACE_SEARCH_M,
  namedPlaceCore,
  namedPlaceKind,
  namedPlaceKindHint,
  namedPlaceQuery,
  namedPlacesFrom,
  PATH_DETOUR,
  pickNamedPlace,
} from '#shared/utils/loops'
import type { NamedOverpassElement, NamedPlace } from '#shared/utils/loops'
import type { LngLat } from '#shared/utils/routes'

// A loop through, or towards, a place the member names (#293): « autour de l'Isère », « en direction de la Chartreuse ».
const grenoble: LngLat = [5.7245, 45.1885]
const metres = (a: LngLat, b: LngLat) => distance(a, b, { units: 'meters' })
const at = (distanceM: number, bearingDeg: number): LngLat =>
  destination(grenoble, distanceM, bearingDeg, { units: 'meters' }).geometry.coordinates as LngLat
const node = (id: number, [lon, lat]: LngLat, tags: Record<string, string>): NamedOverpassElement => ({ type: 'node', id, lat, lon, tags })
const place = (fields: Partial<NamedPlace> & Pick<NamedPlace, 'name' | 'kind' | 'distanceM'>): NamedPlace => ({
  id: `n${fields.name}`,
  coordinates: at(fields.distanceM, 0),
  ...fields,
})

describe('namedPlaceCore', () => {
  it('drops the articles, the accents and the case', () => {
    expect(namedPlaceCore('l\'Isère')).toBe('isere')
    expect(namedPlaceCore('la Chartreuse')).toBe('chartreuse')
    expect(namedPlaceCore('L’Isère')).toBe('isere')
  })

  it('drops the generic words that only say what kind of place it is', () => {
    expect(namedPlaceCore('Massif de la Chartreuse')).toBe('chartreuse')
    expect(namedPlaceCore('Chaîne de Belledonne')).toBe('belledonne')
    expect(namedPlaceCore('Lac de Paladru')).toBe('paladru')
    expect(namedPlaceCore('the river Thames')).toBe('thames')
  })

  it('keeps the other words, so a village named after a massif is not the massif', () => {
    expect(namedPlaceCore('Le Sappey-en-Chartreuse')).toBe('sappey-en-chartreuse')
  })

  it('is empty for a place said by its kind only', () => {
    expect(namedPlaceCore('le lac')).toBe('')
  })
})

describe('namedPlaceKindHint', () => {
  it('reads the kind from the generic word said with the name', () => {
    expect(namedPlaceKindHint('lac de Paladru')).toBe('lake')
    expect(namedPlaceKindHint('massif de Belledonne')).toBe('massif')
    expect(namedPlaceKindHint('la rivière Isère')).toBe('river')
    expect(namedPlaceKindHint('le pic Saint-Michel')).toBe('peak')
  })

  it('gives none for a bare name', () => {
    expect(namedPlaceKindHint('l\'Isère')).toBeNull()
  })
})

describe('namedPlaceKind', () => {
  it('reads rivers, lakes, massifs, peaks and villages', () => {
    expect(namedPlaceKind({ waterway: 'river' })).toBe('river')
    expect(namedPlaceKind({ waterway: 'stream' })).toBe('river')
    expect(namedPlaceKind({ natural: 'water', water: 'lake' })).toBe('lake')
    expect(namedPlaceKind({ boundary: 'natural', place: 'region' })).toBe('massif')
    expect(namedPlaceKind({ natural: 'mountain_range' })).toBe('massif')
    expect(namedPlaceKind({ boundary: 'protected_area' })).toBe('massif')
    expect(namedPlaceKind({ natural: 'peak' })).toBe('peak')
    expect(namedPlaceKind({ place: 'village' })).toBe('village')
    expect(namedPlaceKind({ place: 'town' })).toBe('village')
  })

  it('leaves out the département and the streets that share the name', () => {
    expect(namedPlaceKind({ boundary: 'administrative', admin_level: '6' })).toBeNull()
    expect(namedPlaceKind({ highway: 'residential' })).toBeNull()
  })
})

describe('namedPlaceQuery', () => {
  it('searches a box around the start, south and west first, NAMED_PLACE_SEARCH_M away on each side', () => {
    const query = namedPlaceQuery('l\'Isère', grenoble, 25)!
    // A box rather than `around`: Overpass answers it in time, `around` that far was cut by the timeout.
    const [south, west, north, east] = /\[bbox:([^\]]+)\]/.exec(query)![1]!.split(',').map(Number) as [number, number, number, number]
    expect((south + north) / 2).toBeCloseTo(grenoble[1], 3)
    expect((west + east) / 2).toBeCloseTo(grenoble[0], 3)
    expect(metres([grenoble[0], south], grenoble)).toBeCloseTo(NAMED_PLACE_SEARCH_M, -2)
    expect(metres([east, grenoble[1]], grenoble)).toBeCloseTo(NAMED_PLACE_SEARCH_M, -2)
    expect(query).not.toContain('around')
    expect(query).toContain('[timeout:25]')
  })

  it('matches the name whatever its accents and case', () => {
    const query = namedPlaceQuery('Isère', grenoble, 25)!
    const pattern = /\["name"~"([^"]+)",i\]/.exec(query)![1]!
    const regex = new RegExp(pattern, 'i')
    expect(regex.test('Isère')).toBe(true)
    expect(regex.test('L\'Isere')).toBe(true)
    expect(regex.test('ISÈRE')).toBe(true)
    expect(regex.test('Drac')).toBe(false)
  })

  it('only asks for the kinds of places a loop can head for, never the départements', () => {
    const query = namedPlaceQuery('Isère', grenoble, 25)!
    expect(query).toContain('waterway')
    expect(query).toContain('"place"')
    expect(query).not.toContain('administrative')
  })

  it('escapes what would break the query', () => {
    const query = namedPlaceQuery('Lac "bleu" (haut)', grenoble, 25)!
    expect(query).not.toContain('"bleu"')
    // Brackets and quotes are dropped from the name; what is left of the regex syntax is escaped, twice: once for
    // the regex, once for the Overpass string.
    expect(namedPlaceQuery('A+B', grenoble, 25)).toContain('(a|à|â|ä|A|À|Â|Ä)\\\\+b')
  })

  it('gives no query for a place said by its kind only', () => {
    expect(namedPlaceQuery('le lac', grenoble, 25)).toBeNull()
  })
})

describe('namedPlacesFrom', () => {
  it('takes the point of a river nearest to the start', () => {
    // A river running north-south 1.2 km east of the start.
    const [lng] = at(1200, 90)
    const way: NamedOverpassElement = {
      type: 'way',
      id: 7,
      tags: { waterway: 'river', name: 'L\'Isère' },
      geometry: [{ lat: 45.15, lon: lng }, { lat: 45.23, lon: lng }],
    }
    const [river] = namedPlacesFrom([way], grenoble)
    expect(river).toMatchObject({ id: 'w7', name: 'L\'Isère', kind: 'river' })
    expect(river!.distanceM).toBeGreaterThan(1150)
    expect(river!.distanceM).toBeLessThan(1250)
    expect(Math.abs(bearing(grenoble, river!.coordinates) - 90)).toBeLessThan(2)
  })

  it('takes the centre of a massif and the node of a peak', () => {
    const places = namedPlacesFrom([
      { type: 'relation', id: 3, center: { lat: 45.36, lon: 5.79 }, tags: { boundary: 'natural', place: 'region', name: 'Massif de la Chartreuse' } },
      node(4, at(2000, 180), { natural: 'peak', name: 'Moucherotte' }),
    ], grenoble)
    expect(places.map(found => [found.kind, found.name])).toEqual([['massif', 'Massif de la Chartreuse'], ['peak', 'Moucherotte']])
    expect(places[1]!.distanceM).toBeCloseTo(2000, -1)
  })

  it('leaves out what is not a kind of place to head for, or has no name', () => {
    expect(namedPlacesFrom([
      node(1, at(500, 0), { highway: 'bus_stop', name: 'Isère' }),
      node(2, at(500, 0), { place: 'village' }),
    ], grenoble)).toEqual([])
  })
})

describe('pickNamedPlace', () => {
  const reachM = 3000

  it('goes through the river when it is within reach', () => {
    const river = place({ name: 'L\'Isère', kind: 'river', distanceM: 1200 })
    expect(pickNamedPlace('Isère', [river], grenoble, reachM)).toEqual({ role: 'via', place: river })
  })

  it('heads for a massif without trying to reach it, even when a lake or village shares its name', () => {
    const massif = place({ name: 'Massif de la Chartreuse', kind: 'massif', distanceM: 19000, coordinates: at(19000, 10) })
    const lake = place({ name: 'Lac Chartreuse', kind: 'lake', distanceM: 2000 })
    const village = place({ name: 'Le Sappey-en-Chartreuse', kind: 'village', distanceM: 8000 })
    const choice = pickNamedPlace('la Chartreuse', [village, lake, massif], grenoble, reachM)
    expect(choice?.role).toBe('heading')
    expect(choice?.place).toEqual(massif)
    expect(choice?.role === 'heading' && Math.abs(choice.bearingDeg - 10)).toBeLessThan(1)
  })

  it('heads for a river out of reach', () => {
    const river = place({ name: 'Le Drac', kind: 'river', distanceM: 9000, coordinates: at(9000, -90) })
    const choice = pickNamedPlace('Drac', [river], grenoble, reachM)
    expect(choice?.role).toBe('heading')
    expect(choice?.role === 'heading' && Math.abs(choice.bearingDeg + 90)).toBeLessThan(1)
  })

  it('takes the nearest of places of the same kind and name', () => {
    const far = place({ id: 'w1', name: 'Isère', kind: 'river', distanceM: 2500 })
    const near = place({ id: 'w2', name: 'Isère', kind: 'river', distanceM: 800 })
    expect(pickNamedPlace('Isère', [far, near], grenoble, reachM)?.place).toEqual(near)
  })

  it('takes the kind said with the name', () => {
    const massif = place({ name: 'Massif de la Chartreuse', kind: 'massif', distanceM: 19000 })
    const lake = place({ name: 'Lac Chartreuse', kind: 'lake', distanceM: 2000 })
    expect(pickNamedPlace('lac Chartreuse', [massif, lake], grenoble, reachM)).toEqual({ role: 'via', place: lake })
  })

  it('prefers the place of that very name to one that only contains it', () => {
    const village = place({ name: 'Le Sappey-en-Chartreuse', kind: 'village', distanceM: 2000 })
    const peak = place({ name: 'Chartreuse', kind: 'peak', distanceM: 2900 })
    expect(pickNamedPlace('Chartreuse', [village, peak], grenoble, reachM)?.place).toEqual(peak)
  })

  it('still heads for a place that only contains the name when none has it exactly', () => {
    const village = place({ name: 'Saint-Pierre-de-Chartreuse', kind: 'village', distanceM: 20000 })
    expect(pickNamedPlace('Chartreuse', [village], grenoble, reachM)?.role).toBe('heading')
  })

  it('matches a hyphenated name typed with spaces', () => {
    const village = place({ name: 'Saint-Pierre-de-Chartreuse', kind: 'village', distanceM: 2000 })
    expect(pickNamedPlace('Saint Pierre de Chartreuse', [village], grenoble, reachM)).toEqual({ role: 'via', place: village })
  })

  it('matches whole words only', () => {
    expect(pickNamedPlace('l\'Ain', [place({ name: 'Saint-Égrève', kind: 'village', distanceM: 2000 })], grenoble, reachM)).toBeNull()
  })

  it('finds nothing without places, or for a place said by its kind only', () => {
    expect(pickNamedPlace('Isère', [], grenoble, reachM)).toBeNull()
    expect(pickNamedPlace('le lac', [place({ name: 'Lac Achard', kind: 'lake', distanceM: 1000 })], grenoble, reachM)).toBeNull()
  })
})

describe('loopRoutePoints towards a place (#293)', () => {
  const lengthM = 30_000
  const crowM = lengthM / PATH_DETOUR

  it('starts a loop towards the bearing, through a point a third of its perimeter away, snapped anywhere', () => {
    const route = loopRoutePoints('loop', grenoble, lengthM, 2, undefined, 10)!
    expect(route.points).toHaveLength(4)
    expect(route.points[0]).toEqual(grenoble)
    expect(route.points[3]).toEqual(grenoble)
    expect(metres(grenoble, route.points[1]!)).toBeCloseTo(crowM / 3, -1)
    expect(Math.abs(bearing(grenoble, route.points[1]!) - 10)).toBeLessThan(1)
    expect(route.radiuses).toEqual([350, -1, -1, 350])
  })

  it('sends an out and back towards the bearing, its far ends spread around it', () => {
    const ends = [0, 1, 2].map(seed => loopRoutePoints('out_and_back', grenoble, lengthM, seed, undefined, 10)!)
    for (const route of ends) {
      expect(route.points).toHaveLength(2)
      expect(metres(grenoble, route.points[1]!)).toBeCloseTo(crowM / 2, -1)
      expect(Math.abs(bearing(grenoble, route.points[1]!) - 10)).toBeLessThanOrEqual(26)
    }
    expect(new Set(ends.map(route => route.points[1]!.join(','))).size).toBe(3)
  })

  it('goes through a place rather than towards a bearing when it has both', () => {
    const via = at(2000, 90)
    expect(loopRoutePoints('loop', grenoble, lengthM, 2, via, 10)).toEqual(loopRoutePoints('loop', grenoble, lengthM, 2, via))
  })
})
