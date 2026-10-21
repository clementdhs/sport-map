import { describe, expect, it } from 'vitest'
import {
  MAX_OSM_PLACES,
  osmPlacesFrom,
  osmPlacesPayloadSchema,
  osmPlacesQuery,
  osmPlaceType,
  type OverpassElement,
  placesAlongTrack,
  queryLine,
  toOsmPlace,
} from '#shared/utils/osmPlaces'
import type { LngLat } from '#shared/utils/routes'

// A straight track heading east along the 45th parallel, ~2.36 km long (0.03° of longitude).
const TRACK: LngLat[] = [[5, 45], [5.01, 45], [5.02, 45], [5.03, 45]]
// 0.001° of latitude is ~111 m.
const node = (id: number, lon: number, lat: number, tags: Record<string, string>): OverpassElement =>
  ({ type: 'node', id, lon, lat, tags })

describe('osmPlaceType', () => {
  it('sorts the tags the query asks for into the app types', () => {
    expect(osmPlaceType({ amenity: 'drinking_water' })).toBe('water')
    expect(osmPlaceType({ tourism: 'alpine_hut' })).toBe('hut')
    expect(osmPlaceType({ tourism: 'wilderness_hut' })).toBe('hut')
    expect(osmPlaceType({ amenity: 'shelter', shelter_type: 'picnic_shelter' })).toBe('shelter')
    expect(osmPlaceType({ amenity: 'parking', parking: 'surface' })).toBe('parking')
    expect(osmPlaceType({ amenity: 'toilets' })).toBe('toilets')
    expect(osmPlaceType({ natural: 'peak' })).toBe('peak')
  })

  it('counts fountains, taps and springs only when their water is drinkable', () => {
    expect(osmPlaceType({ amenity: 'fountain', drinking_water: 'yes' })).toBe('water')
    expect(osmPlaceType({ natural: 'spring', drinking_water: 'yes' })).toBe('water')
    expect(osmPlaceType({ man_made: 'water_tap', drinking_water: 'yes' })).toBe('water')
    expect(osmPlaceType({ natural: 'spring' })).toBeNull()
    expect(osmPlaceType({ amenity: 'drinking_water', drinking_water: 'no' })).toBeNull()
    // A restaurant serving water is not a water point.
    expect(osmPlaceType({ amenity: 'restaurant', drinking_water: 'yes' })).toBeNull()
  })

  it('leaves out what is closed to the public, bus shelters and parking lanes', () => {
    expect(osmPlaceType({ amenity: 'parking', access: 'private' })).toBeNull()
    expect(osmPlaceType({ amenity: 'parking', access: 'customers' })).toBeNull()
    expect(osmPlaceType({ amenity: 'toilets', access: 'no' })).toBeNull()
    expect(osmPlaceType({ amenity: 'shelter', shelter_type: 'public_transport' })).toBeNull()
    expect(osmPlaceType({ amenity: 'parking', parking: 'street_side' })).toBeNull()
    expect(osmPlaceType({ amenity: 'bench' })).toBeNull()
  })
})

describe('toOsmPlace', () => {
  it('takes a node position, or the centre of an area', () => {
    expect(toOsmPlace(node(12, 5.0123456789, 45.0012345678, { amenity: 'drinking_water' })))
      .toEqual({ id: 'n12', type: 'water', coordinates: [5.012346, 45.001235] })
    expect(toOsmPlace({ type: 'way', id: 34, center: { lat: 45.001, lon: 5.01 }, tags: { amenity: 'parking', name: ' Col ' } }))
      .toEqual({ id: 'w34', type: 'parking', coordinates: [5.01, 45.001], name: 'Col' })
    expect(toOsmPlace({ type: 'way', id: 35, tags: { amenity: 'parking' } })).toBeNull()
  })

  it('keeps the elevation of peaks, written as OSM allows', () => {
    expect(toOsmPlace(node(1, 5, 45, { natural: 'peak', name: 'Moucherotte', ele: '1901' }))!.ele).toBe(1901)
    expect(toOsmPlace(node(2, 5, 45, { natural: 'peak', ele: '1 234 m' }))!.ele).toBe(1234)
    expect(toOsmPlace(node(3, 5, 45, { natural: 'peak', ele: '2412,6' }))!.ele).toBe(2413)
    expect(toOsmPlace(node(4, 5, 45, { natural: 'peak', ele: 'high' }))!.ele).toBeUndefined()
    expect(toOsmPlace(node(5, 5, 45, { amenity: 'toilets', ele: '300' }))!.ele).toBeUndefined()
  })
})

describe('osmPlacesFrom', () => {
  it('keeps one of a place mapped twice, preferring the named one', () => {
    const places = osmPlacesFrom([
      node(1, 5.01, 45.001, { amenity: 'parking' }),
      { type: 'way', id: 2, center: { lat: 45.00105, lon: 5.0101 }, tags: { amenity: 'parking', name: 'Parking du col' } },
      // Same place, another type: both stay.
      node(3, 5.0101, 45.001, { amenity: 'toilets' }),
      node(1, 5.01, 45.001, { amenity: 'parking' }),
      node(4, 5.02, 45, { amenity: 'bench' }),
    ], TRACK)
    expect(places.map(place => place.id).sort()).toEqual(['n3', 'w2'])
  })

  it('keeps the places nearest to the track when there are too many', () => {
    // Rows of parkings ~24 m apart, 0 to 100 m from the track; the first ten ~330 m away.
    const elements = Array.from({ length: MAX_OSM_PLACES + 10 }, (_, i) =>
      node(i + 1, 5 + (i % 100) * 0.0003, 45 + Math.floor(i / 100) * 0.0003 + (i < 10 ? 0.003 : 0), { amenity: 'parking' }))
    const ids = osmPlacesFrom(elements, TRACK).map(place => place.id)
    expect(ids).toHaveLength(MAX_OSM_PLACES)
    expect(ids).not.toContain('n1')
    expect(ids).not.toContain('n10')
    expect(ids).toContain('n11')
  })
})

describe('placesAlongTrack', () => {
  it('orders the places along the track, with how far they are from it', () => {
    const placed = placesAlongTrack(TRACK, [
      { id: 'n2', type: 'peak', coordinates: [5.02, 45.001] },
      { id: 'n1', type: 'water', coordinates: [5.005, 45] },
    ])
    expect(placed.map(place => place.id)).toEqual(['n1', 'n2'])
    expect(placed[0]!.alongM).toBeCloseTo(393, -1)
    expect(placed[0]!.offsetM).toBeLessThan(1)
    expect(placed[1]!.alongM).toBeCloseTo(1573, -1)
    expect(placed[1]!.offsetM).toBeCloseTo(111, -1)
  })

  it('places nothing without a track', () => {
    expect(placesAlongTrack([[5, 45]], [{ id: 'n1', type: 'water', coordinates: [5, 45] }])).toEqual([])
  })
})

describe('osmPlacesQuery', () => {
  it('asks for the useful places around the simplified track, latitude first', () => {
    const query = osmPlacesQuery(TRACK, 25)
    expect(query.startsWith('[out:json][timeout:25];(')).toBe(true)
    expect(query.endsWith(');out center;')).toBe(true)
    // The straight track keeps its two ends only.
    expect(query).toContain('(around:200,45.00000,5.00000,45.00000,5.03000)')
    expect(query.match(/around:/g)).toHaveLength(2)
    expect(query).toContain('drinking_water|alpine_hut|wilderness_hut|shelter|parking|toilets|peak')
  })

  it('simplifies long tracks further to keep the query small', () => {
    // A zigzag of 2,000 points, ~50 m wide: nothing to simplify at 10 m (more would make the test slow).
    const zigzag: LngLat[] = Array.from({ length: 2000 }, (_, i) => [5 + i * 0.0005, 45 + (i % 2) * 0.0005])
    expect(queryLine(zigzag).length).toBeLessThanOrEqual(800)
    expect(queryLine(TRACK)).toEqual([[5, 45], [5.03, 45]])
  })
})

describe('osmPlacesPayloadSchema', () => {
  it('accepts what the browser found and refuses anything else', () => {
    const place = { id: 'w34', type: 'parking', coordinates: [5.01, 45.001], name: 'Col' }
    expect(osmPlacesPayloadSchema.safeParse({ places: [place] }).success).toBe(true)
    expect(osmPlacesPayloadSchema.safeParse({ places: [] }).success).toBe(true)
    expect(osmPlacesPayloadSchema.safeParse({ places: [{ ...place, id: 'x1' }] }).success).toBe(false)
    expect(osmPlacesPayloadSchema.safeParse({ places: [{ ...place, type: 'bench' }] }).success).toBe(false)
    expect(osmPlacesPayloadSchema.safeParse({ places: Array.from({ length: MAX_OSM_PLACES + 1 }, () => place) }).success).toBe(false)
  })
})
