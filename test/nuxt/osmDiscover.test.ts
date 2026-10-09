import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'

const A: LngLat = [2.6, 48.4]
const B: LngLat = [2.601, 48.401]
const C: LngLat = [2.602, 48.4]

const route: OsmRoute = {
  id: 389996, route: 'hiking', name: 'Sentier Denecourt-Colinet 1', ref: '1', network: 'lwn', roundtrip: true, grade: null, complete: true, distance_m: 300, lines: [[A, B, C, A]],
}

beforeEach(() => {
  setActivePinia(createPinia())
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
    expect(editor.track.elevations).toBeNull()
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
