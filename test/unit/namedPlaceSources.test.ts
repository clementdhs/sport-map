import { describe, expect, it, vi } from 'vitest'
import { destination } from '@turf/turf'
import { NAMED_PLACE_SEARCH_M, type NamedPlace, pickNamedPlace } from '#shared/utils/loops'
import {
  maptilerNamedPlaceQuery,
  maptilerNamedPlaces,
  type MaptilerFeature,
  namedPlaceSources,
  nominatimNamedPlaceQuery,
  nominatimNamedPlaces,
  nominatimRetryName,
  type NominatimResult,
  searchNamedPlacesWith,
} from '#shared/utils/namedPlaces'
import type { LngLat } from '#shared/utils/routes'

// Finding a place the member names without depending on Overpass alone (#310): towns and villages through
// MapTiler's geocoding, peaks, lakes, rivers and massifs through Overpass, Nominatim when Overpass doesn't answer.
const grenoble: LngLat = [5.7245, 45.1885]
const at = (distanceM: number, bearingDeg: number): LngLat =>
  destination(grenoble, distanceM, bearingDeg, { units: 'meters' }).geometry.coordinates as LngLat

const seyssinetFeature: MaptilerFeature = {
  id: 'municipality.46973',
  text: 'Seyssinet-Pariset',
  place_type: ['municipality'],
  center: [5.689961425960064, 45.179076831990706],
  properties: { ref: 'osm:r191039' },
}
const moucherotte: NominatimResult = {
  osm_type: 'node', osm_id: 1508804918, lat: '45.1476026', lon: '5.6394528',
  category: 'natural', type: 'peak', addresstype: 'peak', name: 'Moucherotte',
}

describe('namedPlaceSources', () => {
  it('asks only the geocoder for a place said to be a town or a village', () => {
    expect(namedPlaceSources('le village de Sappey')).toEqual(['geocoder'])
    expect(namedPlaceSources('la ville de Voiron')).toEqual(['geocoder'])
  })

  it('asks only OpenStreetMap for a place said to be a peak, a lake, a river or a massif', () => {
    expect(namedPlaceSources('lac de Paladru')).toEqual(['osm'])
    expect(namedPlaceSources('le mont Rachais')).toEqual(['osm'])
    expect(namedPlaceSources('la rivière Drac')).toEqual(['osm'])
    expect(namedPlaceSources('massif de la Chartreuse')).toEqual(['osm'])
  })

  it('asks both for a bare name, which may be a village or anything else', () => {
    expect(namedPlaceSources('Seyssinet')).toEqual(['geocoder', 'osm'])
    expect(namedPlaceSources('la Chartreuse')).toEqual(['geocoder', 'osm'])
  })
})

describe('searchNamedPlacesWith', () => {
  const found = (name: string, kind: NamedPlace['kind']): NamedPlace[] => [{ id: name, name, kind, coordinates: at(3000, 0), distanceM: 3000 }]
  const down = () => Promise.reject(new Error('down'))

  it('finds a bare village name through the geocoder when Overpass and Nominatim are down', async () => {
    const places = await searchNamedPlacesWith('Seyssinet', {
      geocoder: () => Promise.resolve(found('Seyssinet-Pariset', 'village')),
      overpass: down,
      nominatim: down,
    })
    expect(places.map(place => place.name)).toEqual(['Seyssinet-Pariset'])
  })

  it('merges what the geocoder and OpenStreetMap found for a bare name', async () => {
    const places = await searchNamedPlacesWith('Chartreuse', {
      geocoder: () => Promise.resolve(found('Saint-Pierre-de-Chartreuse', 'village')),
      overpass: () => Promise.resolve(found('Massif de la Chartreuse', 'massif')),
      nominatim: down,
    })
    expect(places.map(place => place.name).sort()).toEqual(['Massif de la Chartreuse', 'Saint-Pierre-de-Chartreuse'])
  })

  it('asks Nominatim only when Overpass doesn\'t answer', async () => {
    const nominatim = vi.fn(() => Promise.resolve(found('Lac de Paladru', 'lake')))
    const answered = await searchNamedPlacesWith('lac de Paladru', { geocoder: down, overpass: () => Promise.resolve([]), nominatim })
    expect(answered).toEqual([])
    expect(nominatim).not.toHaveBeenCalled()

    const places = await searchNamedPlacesWith('lac de Paladru', { geocoder: down, overpass: down, nominatim })
    expect(places.map(place => place.name)).toEqual(['Lac de Paladru'])
    expect(nominatim).toHaveBeenCalledTimes(1)
  })

  it('never asks the geocoder for a peak, a lake, a river or a massif', async () => {
    const geocoder = vi.fn(() => Promise.resolve([]))
    await searchNamedPlacesWith('mont Rachais', { geocoder, overpass: () => Promise.resolve([]), nominatim: down })
    expect(geocoder).not.toHaveBeenCalled()
  })

  it('falls back on Nominatim for a village when the geocoder doesn\'t answer, without asking Overpass', async () => {
    const overpass = vi.fn(() => Promise.resolve([]))
    const places = await searchNamedPlacesWith('village de Sappey', {
      geocoder: down,
      overpass,
      nominatim: () => Promise.resolve(found('Le Sappey-en-Chartreuse', 'village')),
    })
    expect(places.map(place => place.name)).toEqual(['Le Sappey-en-Chartreuse'])
    expect(overpass).not.toHaveBeenCalled()
  })

  it('asks Nominatim once for a bare name when every other source is down', async () => {
    const nominatim = vi.fn(() => Promise.resolve(found('Seyssinet-Pariset', 'village')))
    const places = await searchNamedPlacesWith('Seyssinet', { geocoder: down, overpass: down, nominatim })
    expect(places).toHaveLength(1)
    expect(nominatim).toHaveBeenCalledTimes(1)
  })

  it('fails when no source answers, so the member is told OpenStreetMap is down', async () => {
    await expect(searchNamedPlacesWith('Seyssinet', { geocoder: down, overpass: down, nominatim: down })).rejects.toThrow()
  })

  it('answers nothing found when the sources answer without the place', async () => {
    const none = () => Promise.resolve([])
    expect(await searchNamedPlacesWith('Atlantide', { geocoder: none, overpass: down, nominatim: none })).toEqual([])
  })
})

describe('maptilerNamedPlaceQuery', () => {
  it('looks for settlements near the start, within the search box', () => {
    const query = maptilerNamedPlaceQuery(grenoble)
    expect(query.proximity).toBe(grenoble.join(','))
    expect(query.types.split(',')).toEqual(expect.arrayContaining(['municipality', 'locality', 'place']))
    const [west, south, east, north] = query.bbox.split(',').map(Number) as [number, number, number, number]
    expect(west).toBeLessThan(grenoble[0])
    expect(east).toBeGreaterThan(grenoble[0])
    expect(south).toBeLessThan(grenoble[1])
    expect(north).toBeGreaterThan(grenoble[1])
    expect(query.limit).toBeGreaterThan(1)
  })
})

describe('maptilerNamedPlaces', () => {
  it('turns a commune into a village, keyed by its OpenStreetMap id, with its distance from the start', () => {
    const [place] = maptilerNamedPlaces([seyssinetFeature], grenoble)
    expect(place).toMatchObject({ id: 'r191039', name: 'Seyssinet-Pariset', kind: 'village', coordinates: [5.689961, 45.179077] })
    expect(place!.distanceM).toBeGreaterThan(2500)
    expect(place!.distanceM).toBeLessThan(3500)
  })

  it('drops what lies outside the search box, such as a fuzzy match far away', () => {
    const farAway: MaptilerFeature = { id: 'place.3776970', text: 'le Reyssinet', place_type: ['place'], center: [-0.8948, 45.3635], properties: { ref: 'osm:n12652601866' } }
    expect(maptilerNamedPlaces([farAway, seyssinetFeature], grenoble).map(place => place.name)).toEqual(['Seyssinet-Pariset'])
  })

  it('drops addresses, roads and points of interest', () => {
    const road: MaptilerFeature = { id: 'road.1', text: 'Rue de Seyssinet', place_type: ['road'], center: at(1000, 90), properties: {} }
    expect(maptilerNamedPlaces([road], grenoble)).toEqual([])
  })

  it('makes « vers Seyssinet » go through Seyssinet-Pariset', () => {
    const choice = pickNamedPlace('Seyssinet', maptilerNamedPlaces([seyssinetFeature], grenoble), grenoble, 6000)
    expect(choice).toMatchObject({ role: 'via', place: { name: 'Seyssinet-Pariset' } })
  })
})

describe('nominatimNamedPlaceQuery', () => {
  it('asks for the name within the search box only, a few answers, with line geometries', () => {
    const query = nominatimNamedPlaceQuery('lac de Paladru', grenoble, 'fr')
    expect(query).toMatchObject({ q: 'lac de Paladru', format: 'jsonv2', bounded: 1, polygon_geojson: 1, 'accept-language': 'fr' })
    expect(query.limit).toBeLessThanOrEqual(10)
    const [west, north, east, south] = query.viewbox.split(',').map(Number) as [number, number, number, number]
    expect(west).toBeLessThan(grenoble[0])
    expect(east).toBeGreaterThan(grenoble[0])
    expect(north).toBeGreaterThan(grenoble[1])
    expect(south).toBeLessThan(grenoble[1])
  })
})

describe('nominatimRetryName', () => {
  // Nominatim finds « l'Isère » as said but only the département for « isere », and finds « moucherotte » but
  // nothing for « le mont Moucherotte »: the name as said first, then its core when that found nothing.
  it('retries a name said with generic words with its core', () => {
    expect(nominatimRetryName('le mont Moucherotte')).toBe('moucherotte')
    expect(nominatimRetryName('lac de Paladru')).toBe('paladru')
  })

  it('doesn\'t retry a name that is already its core', () => {
    expect(nominatimRetryName('Moucherotte')).toBeNull()
    expect(nominatimRetryName('Seyssinet')).toBeNull()
  })
})

describe('nominatimNamedPlaces', () => {
  it('takes a natural boundary as a massif, as Nominatim gives the Massif de la Chartreuse', () => {
    const massif: NominatimResult = { ...moucherotte, osm_type: 'relation', osm_id: 3, category: 'boundary', type: 'natural', addresstype: 'natural', name: 'Massif de la Chartreuse' }
    expect(nominatimNamedPlaces([massif], grenoble)[0]).toMatchObject({ kind: 'massif' })
  })

  it('turns a peak into a peak at its point', () => {
    expect(nominatimNamedPlaces([moucherotte], grenoble)[0]).toMatchObject({ id: 'n1508804918', name: 'Moucherotte', kind: 'peak', coordinates: [5.639453, 45.147603] })
  })

  it('goes through a river at its point nearest to the start', () => {
    const [lng, lat] = grenoble
    const river: NominatimResult = {
      osm_type: 'relation', osm_id: 7, lat: String(lat + 0.04), lon: String(lng + 0.015), category: 'waterway', type: 'river', addresstype: 'river', name: 'L\'Isère',
      geojson: { type: 'MultiLineString', coordinates: [[[lng + 0.015, lat - 0.05], [lng + 0.015, lat + 0.05]]] },
    }
    const [place] = nominatimNamedPlaces([river], grenoble)
    expect(place).toMatchObject({ id: 'r7', kind: 'river' })
    expect(place!.coordinates[1]).toBeCloseTo(lat, 3)
  })

  it('takes a lake, a mountain range and a protected area', () => {
    const kinds = nominatimNamedPlaces([
      { ...moucherotte, osm_id: 1, category: 'natural', type: 'water', name: 'Lac de Paladru' },
      { ...moucherotte, osm_id: 2, category: 'natural', type: 'mountain_range', name: 'Chartreuse' },
      { ...moucherotte, osm_id: 3, category: 'boundary', type: 'protected_area', name: 'Parc naturel régional de Chartreuse' },
    ], grenoble).map(place => place.kind)
    expect(kinds).toEqual(['lake', 'massif', 'massif'])
  })

  it('takes a commune\'s boundary as a village, never a département', () => {
    const commune: NominatimResult = { ...moucherotte, osm_type: 'relation', osm_id: 225564, category: 'boundary', type: 'administrative', addresstype: 'village', name: 'Saint-Nizier-du-Moucherotte' }
    const departement: NominatimResult = { ...moucherotte, osm_type: 'relation', osm_id: 7437, category: 'boundary', type: 'administrative', addresstype: 'county', name: 'Isère' }
    expect(nominatimNamedPlaces([commune, departement], grenoble).map(place => [place.name, place.kind])).toEqual([['Saint-Nizier-du-Moucherotte', 'village']])
  })

  it('drops roads and what lies outside the search box', () => {
    const road: NominatimResult = { ...moucherotte, osm_type: 'way', osm_id: 9, category: 'highway', type: 'unclassified', addresstype: 'unclassified' }
    const far = at(NAMED_PLACE_SEARCH_M * 1.5, 0)
    const farPeak: NominatimResult = { ...moucherotte, osm_id: 10, lat: String(far[1]), lon: String(far[0]) }
    expect(nominatimNamedPlaces([road, farPeak], grenoble)).toEqual([])
  })
})
