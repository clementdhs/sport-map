import { readBody } from 'h3'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OsmRouteElevation } from '#shared/types/osm'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'

const { searchOsmRoutesMock } = vi.hoisted(() => ({ searchOsmRoutesMock: vi.fn() }))
mockNuxtImport('searchOsmRoutes', () => searchOsmRoutesMock)

// Fake server (#71): the family's cache, and the computation of a route's gain (its id / 1000 m), failing when
// asked to.
let cache: OsmRouteElevation[] = []
const lookups: number[][] = []
const computed: { relation_id: number, version: number, coordinates: LngLat[] }[] = []
let computeFails = false
registerEndpoint('/api/osm/elevations/lookup', {
  method: 'POST',
  handler: async (event) => {
    const { ids } = await readBody<{ ids: number[] }>(event)
    lookups.push(ids)
    return cache.filter(row => ids.includes(row.relation_id))
  },
})
registerEndpoint('/api/osm/elevations', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ relation_id: number, version: number, coordinates: LngLat[] }>(event)
    computed.push(body)
    if (computeFails) throw createError({ statusCode: 502 })
    return { relation_id: body.relation_id, version: body.version, distance_m: 300, gain_m: body.relation_id / 1000, loss_m: 0 }
  },
})
registerEndpoint('/api/elevations', {
  method: 'POST',
  handler: async (event) => {
    const { coordinates } = await readBody<{ coordinates: LngLat[] }>(event)
    return { elevations: coordinates.map(() => 100) }
  },
})

const A: LngLat = [2.6, 48.4]
const B: LngLat = [2.601, 48.401]
const C: LngLat = [2.602, 48.4]

const route: OsmRoute = {
  id: 389996, version: 9, route: 'hiking', name: 'Sentier Denecourt-Colinet 1', ref: '1', network: 'lwn', roundtrip: true, grade: null, complete: true, distance_m: 300, lines: [[A, B, C, A]],
}

beforeEach(() => {
  setActivePinia(createPinia())
  cache = []
  lookups.length = 0
  computed.length = 0
  computeFails = false
})

describe('importIntoEditor', () => {
  it('starts the route with the marked one, its sport and its source', async () => {
    const discover = useOsmDiscoverStore()
    discover.kind = 'mtb'
    await nextTick()
    discover.importIntoEditor(route)

    const editor = useRouteEditorStore()
    expect(editor.segments).toHaveLength(1)
    expect(editor.segments[0]!.mode).toBe('imported')
    expect(editor.track.coordinates).toEqual([A, B, C, A])
    // OpenStreetMap has none: the editor asks for them.
    await vi.waitFor(() => expect(editor.track.elevations).toEqual([100, 100, 100, 100]))
    expect(editor.details).toMatchObject({ name: 'Sentier Denecourt-Colinet 1', sport_type: 'mountain_biking' })
    expect(editor.details.description).toContain('https://www.openstreetmap.org/relation/389996')
    expect(editor.details.description).toContain('OpenStreetMap')
  })

  it('keeps the name and description already typed', () => {
    const editor = useRouteEditorStore()
    editor.details.name = 'Ma sortie'
    editor.details.description = 'Avec les enfants'
    useOsmDiscoverStore().importIntoEditor(route)

    expect(editor.details).toMatchObject({ name: 'Ma sortie', description: 'Avec les enfants', sport_type: 'hiking' })
  })

  it('starts a new route instead of changing the saved one being edited', () => {
    const editor = useRouteEditorStore()
    editor.editingId = '00000000-0000-0000-0000-000000000001'
    editor.details.name = 'Parcours enregistré'
    useOsmDiscoverStore().importIntoEditor(route)

    expect(editor.editingId).toBeNull()
    expect(editor.details.name).toBe('Sentier Denecourt-Colinet 1')
  })
})

describe('filters', () => {
  const far: OsmRoute = { ...route, id: 2, name: 'GR 1', network: 'nwn', roundtrip: false, distance_m: 40_000 }

  it('only shows the routes matching the filters, and unselects a hidden one', () => {
    const discover = useOsmDiscoverStore()
    discover.routes = [route, far]
    discover.selectedId = far.id
    discover.filters.scopes = ['local']

    expect(discover.shownRoutes.map(({ id }) => id)).toEqual([route.id])
    expect(discover.activeFilterCount).toBe(1)
    return nextTick().then(() => expect(discover.selectedId).toBeNull())
  })

  it('forgets the grade when the kind changes: walking and MTB scales differ', () => {
    const discover = useOsmDiscoverStore()
    discover.routes = [route]
    discover.filters.maxGrade = 2
    discover.setKind('mtb')

    expect(discover.filters.maxGrade).toBeNull()
    expect(discover.routes).toEqual([])
  })

  it('takes the kind, the filters and the view of a shared link together', () => {
    const discover = useOsmDiscoverStore()
    discover.routes = [route]
    discover.applyState(parseOsmDiscoverQuery({ kind: 'mtb', grade: '1', shape: 'loop', at: '48.41,2.65,12' }))

    expect(discover.kind).toBe('mtb')
    expect(discover.filters).toMatchObject({ maxGrade: 1, shape: 'loop' })
    expect(discover.view).toEqual({ center: [2.65, 48.41], zoom: 12 })
    // The results of the other kind are gone.
    expect(discover.routes).toEqual([])
  })
})

describe('elevation gains', () => {
  const cached: OsmRoute = { ...route, id: 100_000, version: 4 }
  const changed: OsmRoute = { ...route, id: 200_000, version: 6 }
  const fresh: OsmRoute = { ...route, id: 300_000, version: 1 }
  const incomplete: OsmRoute = { ...route, id: 400_000, complete: false, lines: [[A, B], [C, A]] }

  async function searchWith(found: OsmRoute[]) {
    const discover = useOsmDiscoverStore()
    searchOsmRoutesMock.mockResolvedValueOnce(found)
    discover.setView({ bounds: [2.59, 48.39, 2.61, 48.41], center: [2.6, 48.4], zoom: 14 })
    await discover.search()
    return discover
  }

  it('shows the cached gains, then computes the others one at a time while the page is open', async () => {
    // The relation of `changed` was edited since its gain was computed.
    cache = [
      { relation_id: cached.id, version: 4, distance_m: 300, gain_m: 42, loss_m: 42 },
      { relation_id: changed.id, version: 5, distance_m: 300, gain_m: 99, loss_m: 99 },
    ]
    useOsmDiscoverStore().startElevations()
    const discover = await searchWith([cached, changed, fresh, incomplete])

    await vi.waitFor(() => expect(discover.elevationState(fresh)).toEqual({ status: 'known', gain_m: 300 }))
    // Only the complete routes can be imported, so only they have a gain.
    expect(lookups).toEqual([[cached.id, changed.id, fresh.id]])
    expect(discover.elevationState(cached)).toEqual({ status: 'known', gain_m: 42 })
    expect(discover.elevationState(changed)).toEqual({ status: 'known', gain_m: 200 })
    expect(discover.elevationState(incomplete)).toEqual({ status: 'unknown' })
    // Computed from the points the editor would import.
    expect(computed.map(({ relation_id, version, coordinates }) => [relation_id, version, coordinates]))
      .toEqual([[changed.id, 6, osmRouteTrack(changed).coordinates], [fresh.id, 1, osmRouteTrack(fresh).coordinates]])
    expect(discover.computingElevationId).toBeNull()
    expect(discover.elevationsLeft).toBe(0)
  })

  it('filters on the gain, keeping the routes whose gain is unknown', async () => {
    cache = [{ relation_id: cached.id, version: 4, distance_m: 300, gain_m: 42, loss_m: 42 }]
    const discover = await searchWith([cached, fresh, incomplete])
    discover.filters.gainM = [100, OSM_GAIN_MAX_M]

    await vi.waitFor(() => expect(discover.elevationState(cached).status).toBe('known'))
    expect(discover.shownRoutes.map(({ id }) => id)).toEqual([fresh.id, incomplete.id])
  })

  it('computes nothing while the page is closed, nor the routes hidden by the filters', async () => {
    const discover = useOsmDiscoverStore()
    discover.filters.distanceKm = [5, OSM_DISTANCE_MAX_KM]
    const far: OsmRoute = { ...fresh, id: 500_000, distance_m: 8000 }
    await searchWith([fresh, far])
    await vi.waitFor(() => expect(lookups).toHaveLength(1))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(computed).toEqual([])

    discover.startElevations()
    await vi.waitFor(() => expect(discover.elevationState(far).status).toBe('known'))
    expect(computed.map(({ relation_id }) => relation_id)).toEqual([far.id])

    discover.stopElevations()
    discover.filters.distanceKm = [0, OSM_DISTANCE_MAX_KM]
    await nextTick()
    expect(computed).toHaveLength(1)
  })

  it('stops after a failure until the list changes, and marks the route unknown', async () => {
    computeFails = true
    const discover = useOsmDiscoverStore()
    discover.startElevations()
    await searchWith([fresh, changed])
    await vi.waitFor(() => expect(discover.elevationState(fresh)).toEqual({ status: 'unknown' }))
    expect(computed.map(({ relation_id }) => relation_id)).toEqual([fresh.id])
    expect(discover.elevationState(changed)).toEqual({ status: 'pending' })

    computeFails = false
    discover.filters.shape = 'loop'
    await vi.waitFor(() => expect(discover.elevationState(changed).status).toBe('known'))
  })
})
