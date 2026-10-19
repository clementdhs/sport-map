import { createError, readBody } from 'h3'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteDetail } from '#shared/types/routes'
import type { LngLat, RouteCreatePayload, RoutingSegmentRequest, WayInfo } from '#shared/utils/routes'

// Fake routing service: a straight line through the midpoint, 100 m → 150 m → 200 m of elevation; when snapped, a
// street then a T2 path with a dirt surface. With a quota set, it counts down and answers 429 once it is used up,
// like the real one.
const routingCalls: RoutingSegmentRequest[] = []
let routingQuota: number | null = null
registerEndpoint('/api/routing/segment', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<RoutingSegmentRequest>(event)
    routingCalls.push(body)
    if (routingQuota !== null && routingQuota <= 0) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Limite de 300 calculs d\'itinéraire par jour atteinte',
        data: { reason: ROUTING_QUOTA_REASON },
      })
    }
    if (routingQuota !== null) routingQuota--
    const { from, to } = body
    const mid: LngLat = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
    const wayInfo: WayInfo = { surface: [[0, 1, 3], [1, 2, 11]], waytype: [[0, 1, 3], [1, 2, 4]], sac_scale: [[0, 1, 0], [1, 2, 2]], mtb_scale: [] }
    return {
      coordinates: [from, mid, to],
      elevations: [100, 150, 200],
      snapped: true,
      ...(body.mode === 'snap' ? { way_info: wayInfo } : {}),
      quota_remaining: routingQuota ?? undefined,
    }
  },
})

// Fake elevation service (#71): 100 m, then 10 m higher at each point; fails when asked to.
const elevationCalls: LngLat[][] = []
let elevationsFail = false
registerEndpoint('/api/elevations', {
  method: 'POST',
  handler: async (event) => {
    const { coordinates } = await readBody<{ coordinates: LngLat[] }>(event)
    elevationCalls.push(coordinates)
    if (elevationsFail) throw createError({ statusCode: 502, statusMessage: 'Le service d\'altitude ne répond pas' })
    return { elevations: coordinates.map((_, i) => 100 + 10 * i) }
  },
})

let createdBody: RouteCreatePayload | undefined
registerEndpoint('/api/routes', {
  method: 'POST',
  handler: async (event) => {
    createdBody = await readBody(event)
    return { id: 'new-route' }
  },
})

let updatedBody: RouteCreatePayload | undefined
registerEndpoint('/api/routes/existing-route', {
  method: 'PUT',
  handler: async (event) => {
    updatedBody = await readBody(event)
    return { id: 'existing-route' }
  },
})

const A: LngLat = [6.1, 45.9]
const B: LngLat = [6.2, 45.95]
const C: LngLat = [6.3, 45.9]

async function settled(editor: ReturnType<typeof useRouteEditorStore>) {
  await vi.waitFor(() => expect(editor.isRouting).toBe(false))
}

async function drawABC() {
  const editor = useRouteEditorStore()
  editor.snapToPaths = true
  editor.addWaypoint(A)
  editor.addWaypoint(B)
  editor.addWaypoint(C)
  await settled(editor)
  return editor
}

function routeDetail(body: RouteCreatePayload, overrides: Partial<RouteDetail> = {}): RouteDetail {
  return {
    id: 'existing-route',
    name: body.name,
    description: body.description ?? null,
    sport_type: body.sport_type,
    distance_m: 0,
    elevation_gain_m: null,
    elevation_loss_m: null,
    is_public: body.is_public,
    source: body.source ?? 'drawn',
    created_at: '2026-09-28T10:00:00Z',
    updated_at: '2026-09-28T10:00:00Z',
    rating_avg: null,
    rating_count: 0,
    owner_id: 'me',
    geometry: { type: 'LineString', coordinates: body.coordinates },
    elevation_profile: body.elevations ?? null,
    editor_state: body.editor_state ?? null,
    pois: body.pois ?? [],
    way_info: body.way_info ?? null,
    photos: [],
    outings: [],
    owner: { username: 'test', display_name: null },
    viewer: null,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  routingCalls.length = 0
  routingQuota = null
  createdBody = undefined
  updatedBody = undefined
  useToast().clear()
})

describe('drawing', () => {
  it('routes one segment per new waypoint and joins them', async () => {
    const editor = await drawABC()
    expect(routingCalls).toHaveLength(2)
    expect(routingCalls[0]).toMatchObject({ from: A, to: B, mode: 'snap', sport_type: 'running' })
    // 3 points per segment, sharing the junction.
    expect(editor.track.coordinates).toHaveLength(5)
    expect(editor.track.ranges).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }])
    expect(editor.track.elevations).toEqual([100, 150, 200, 150, 200])
    expect(editor.canSave).toBe(true)
  })

  it('joins the way info of the segments, renumbered in the track', async () => {
    const editor = await drawABC()
    expect(editor.track.wayInfo).toEqual({
      surface: [[0, 1, 3], [1, 2, 11], [2, 3, 3], [3, 4, 11]],
      waytype: [[0, 1, 3], [1, 2, 4], [2, 3, 3], [3, 4, 4]],
      sac_scale: [[0, 1, 0], [1, 2, 2], [2, 3, 0], [3, 4, 2]],
      mtb_scale: [],
    })
  })

  it('uses the straight mode when snapping is off', async () => {
    const editor = useRouteEditorStore()
    editor.snapToPaths = false
    editor.addWaypoint(A)
    editor.addWaypoint(B)
    await settled(editor)
    expect(routingCalls[0]!.mode).toBe('straight')
    // Nothing is known of the ways a straight line crosses.
    expect(editor.track.wayInfo).toBeNull()
  })
})

describe('changing the sport', () => {
  it('leaves the drawn segments as they are, and routes the new ones for the new sport', async () => {
    const editor = await drawABC()
    expect(editor.outdatedSegmentCount).toBe(0)

    editor.details.sport_type = 'mountain_biking'
    expect(editor.outdatedSegmentCount).toBe(2)
    editor.addWaypoint([6.4, 45.95])
    await settled(editor)
    expect(routingCalls.map(call => call.sport_type)).toEqual(['running', 'running', 'mountain_biking'])
    expect(editor.outdatedSegmentCount).toBe(2)

    // Back to a sport routed the same way: nothing is outdated any more, but the new segment now is.
    editor.details.sport_type = 'running'
    expect(editor.outdatedSegmentCount).toBe(1)
  })

  it('ignores sports sharing a profile, straight lines and imported tracks', async () => {
    const editor = useRouteEditorStore()
    editor.details.sport_type = 'trail'
    editor.importTrack({ name: null, coordinates: [A, B], elevations: [100, 120] })
    editor.addWaypoint(C)
    editor.snapToPaths = false
    editor.addWaypoint([6.4, 45.95])
    await settled(editor)

    editor.details.sport_type = 'hiking'
    expect(editor.outdatedSegmentCount).toBe(0)
    editor.details.sport_type = 'cycling'
    expect(editor.outdatedSegmentCount).toBe(1)
  })

  it('routes the outdated segments again for the new sport, undoably', async () => {
    const editor = await drawABC()
    editor.snapToPaths = false
    editor.addWaypoint([6.4, 45.95])
    await settled(editor)
    editor.details.sport_type = 'road_cycling'
    routingCalls.length = 0

    editor.rerouteForSport()
    expect(editor.isRouting).toBe(true)
    await settled(editor)
    // The straight segment stays as it was.
    expect(routingCalls).toEqual([
      expect.objectContaining({ from: A, to: B, mode: 'snap', sport_type: 'road_cycling' }),
      expect.objectContaining({ from: B, to: C, mode: 'snap', sport_type: 'road_cycling' }),
    ])
    expect(editor.outdatedSegmentCount).toBe(0)
    expect(editor.track.coordinates).toHaveLength(7)

    editor.undo()
    expect(editor.outdatedSegmentCount).toBe(2)
  })

  it('keeps the track when the daily quota refuses to route it again', async () => {
    const editor = await drawABC()
    const before = editor.track.coordinates
    editor.details.sport_type = 'hiking'
    routingQuota = 0

    editor.rerouteForSport()
    await settled(editor)
    expect(editor.routingQuotaReached).toBe(true)
    expect(editor.track.coordinates).toEqual(before)
    expect(editor.outdatedSegmentCount).toBe(2)
    // Nothing more is asked once the quota is used up.
    routingCalls.length = 0
    editor.rerouteForSport()
    expect(routingCalls).toHaveLength(0)
  })

  it('knows a reloaded route was routed for its own sport', async () => {
    const editor = await drawABC()
    editor.details.name = 'Boucle test'
    editor.details.sport_type = 'cycling'
    editor.rerouteForSport()
    await settled(editor)
    await editor.save()

    editor.loadRoute(routeDetail(createdBody!))
    expect(editor.outdatedSegmentCount).toBe(0)
    editor.details.sport_type = 'running'
    expect(editor.outdatedSegmentCount).toBe(2)
  })
})

describe('default sport', () => {
  it('starts a new route with the member\'s default sport, following the setting until they pick another', () => {
    const editor = useRouteEditorStore()
    editor.preselectSport(null)
    expect(editor.details.sport_type).toBe('running')

    editor.preselectSport('trail')
    expect(editor.details.sport_type).toBe('trail')
    // The account arrives with another setting.
    editor.preselectSport('mountain_biking')
    expect(editor.details.sport_type).toBe('mountain_biking')

    editor.details.sport_type = 'hiking'
    editor.preselectSport('trail')
    expect(editor.details.sport_type).toBe('hiking')

    // Set back to none, the editor's own default.
    editor.reset()
    editor.preselectSport('trail')
    editor.preselectSport(null)
    expect(editor.details.sport_type).toBe('running')

    // A new draft starts again from the setting.
    editor.reset()
    editor.preselectSport('trail')
    expect(editor.details.sport_type).toBe('trail')
  })

  it('leaves a draft already traced and a saved route as they are', async () => {
    const editor = await drawABC()
    editor.preselectSport('cycling')
    expect(editor.details.sport_type).toBe('running')

    editor.details.name = 'Boucle test'
    await editor.save()
    editor.loadRoute(routeDetail(createdBody!))
    editor.clearPoints()
    editor.preselectSport('cycling')
    expect(editor.details.sport_type).toBe('running')
  })
})

describe('daily routing quota', () => {
  it('counts down what is left, then draws straight lines without asking again, warning once', async () => {
    const { toasts } = useToast()
    const quotaToasts = () => toasts.value.filter(toast => toast.title === 'Limite quotidienne atteinte')
    routingQuota = 2
    const editor = useRouteEditorStore()
    editor.addWaypoint(A)
    editor.addWaypoint(B)
    await settled(editor)
    expect(editor.routingQuotaRemaining).toBe(1)
    expect(editor.routingQuotaReached).toBe(false)

    editor.addWaypoint(C)
    editor.addWaypoint([6.4, 45.95])
    await settled(editor)
    // The second call used the last one; the third was refused.
    expect(routingCalls).toHaveLength(3)
    expect(editor.routingQuotaReached).toBe(true)
    expect(editor.routingQuotaRemaining).toBe(0)
    const refused = editor.segments[2]!
    expect(refused.coordinates).toEqual([C, [6.4, 45.95]])
    expect(refused.elevations).toBeNull()
    expect(quotaToasts()).toHaveLength(1)
    expect(quotaToasts()[0]!.description).toContain("Limite de 300 calculs d'itinéraire par jour atteinte. Les segments sont tracés en ligne droite")

    // No more requests, no more warnings: the segment just stays straight.
    editor.addWaypoint([6.5, 45.9])
    await settled(editor)
    expect(routingCalls).toHaveLength(3)
    expect(editor.segments).toHaveLength(4)
    expect(editor.track.coordinates.at(-1)).toEqual([6.5, 45.9])
    expect(quotaToasts()).toHaveLength(1)
  })
})

describe('editing waypoints', () => {
  it('recomputes only the two segments around a moved waypoint', async () => {
    const editor = await drawABC()
    routingCalls.length = 0
    editor.moveWaypoint(1, [6.2, 46])
    await settled(editor)
    expect(routingCalls.map(call => [call.from, call.to])).toEqual([[A, [6.2, 46]], [[6.2, 46], C]])
  })

  it('recomputes a single segment when the start moves', async () => {
    const editor = await drawABC()
    routingCalls.length = 0
    editor.moveWaypoint(0, [6.05, 45.9])
    await settled(editor)
    expect(routingCalls).toHaveLength(1)
  })

  it('splits a segment when inserting and merges when removing', async () => {
    const editor = await drawABC()
    editor.insertWaypoint(0, [6.15, 45.8])
    await settled(editor)
    expect(editor.waypoints).toHaveLength(4)
    expect(editor.segments).toHaveLength(3)

    editor.removeWaypoint(1)
    await settled(editor)
    expect(editor.waypoints).toEqual([A, B, C])
    expect(editor.segments).toHaveLength(2)
  })

  it('undoes any action, one at a time', async () => {
    const editor = await drawABC()
    const drawn = [...editor.track.coordinates]
    editor.moveWaypoint(1, [6.2, 46])
    await settled(editor)
    editor.undo()
    expect(editor.track.coordinates).toEqual(drawn)

    editor.undo()
    editor.undo()
    editor.undo()
    expect(editor.waypoints).toEqual([])
    expect(editor.canUndo).toBe(false)
  })
})

describe('finishing a route', () => {
  it('appends the track reversed without routing it again', async () => {
    const editor = await drawABC()
    const oneWay = editor.distanceM
    routingCalls.length = 0
    editor.outAndBack()
    expect(routingCalls).toHaveLength(0)
    expect(editor.waypoints).toEqual([A, B, C, B, A])
    expect(editor.distanceM).toBeCloseTo(oneWay * 2)
    // The way back has the same ways in reverse order; at the turnaround, the dirt path goes on in one range.
    expect(editor.track.wayInfo!.surface).toEqual([[0, 1, 3], [1, 2, 11], [2, 3, 3], [3, 5, 11], [5, 6, 3], [6, 7, 11], [7, 8, 3]])
    expect(editor.isLoop).toBe(true)
    expect(editor.canFinish).toBe(false)

    editor.undo()
    expect(editor.waypoints).toEqual([A, B, C])
  })

  it('routes a last segment back to the start', async () => {
    const editor = await drawABC()
    routingCalls.length = 0
    editor.returnToStart()
    await settled(editor)
    expect(routingCalls.map(call => [call.from, call.to])).toEqual([[C, A]])
    expect(editor.isLoop).toBe(true)
  })
})

describe('imported tracks', () => {
  it('locks the imported segment but lets the user extend it', async () => {
    const editor = useRouteEditorStore()
    editor.importTrack({ name: 'Trace GPX', coordinates: [A, B, C], elevations: null })
    expect(editor.details.name).toBe('Trace GPX')
    expect(editor.canEditWaypoint(0)).toBe(false)
    expect(editor.canEditWaypoint(1)).toBe(false)

    editor.moveWaypoint(1, [7, 47])
    expect(editor.waypoints[1]).toEqual(C)

    editor.addWaypoint([6.4, 45.9])
    await settled(editor)
    expect(editor.canEditWaypoint(2)).toBe(true)
  })

  it('asks the elevations of a track imported without any, and saving waits for them', async () => {
    elevationCalls.length = 0
    elevationsFail = false
    const editor = useRouteEditorStore()
    editor.importTrack({ name: 'Parcours balisé', coordinates: [A, B, C], elevations: null })
    expect(editor.isRouting).toBe(true)
    expect(editor.canSave).toBe(false)

    await settled(editor)
    expect(elevationCalls).toEqual([[A, B, C]])
    expect(editor.track.elevations).toEqual([100, 110, 120])
    expect(editor.elevation?.gain).toBeGreaterThan(0)
    expect(editor.canSave).toBe(true)
  })

  it('keeps the elevations of a GPX that has them', async () => {
    elevationCalls.length = 0
    const editor = useRouteEditorStore()
    editor.importTrack({ name: null, coordinates: [A, B, C], elevations: [300, 250, 200] })
    expect(editor.isRouting).toBe(false)
    expect(editor.track.elevations).toEqual([300, 250, 200])
    expect(elevationCalls).toEqual([])
  })

  it('keeps the track without elevation when the service fails', async () => {
    elevationsFail = true
    const editor = useRouteEditorStore()
    editor.importTrack({ name: null, coordinates: [A, B, C], elevations: null })
    await settled(editor)
    expect(editor.track.coordinates).toEqual([A, B, C])
    expect(editor.track.elevations).toBeNull()
    expect(editor.canSave).toBe(true)
    elevationsFail = false
  })

  it('asks again for an import restored by undo while its elevations were loading', async () => {
    elevationCalls.length = 0
    const editor = useRouteEditorStore()
    editor.importTrack({ name: null, coordinates: [A, B, C], elevations: null })
    // Saved while the elevations were still loading.
    editor.addPoi(B)
    await settled(editor)
    editor.undo()

    await settled(editor)
    expect(editor.track.elevations).toEqual([100, 110, 120])
    expect(elevationCalls).toHaveLength(2)
  })
})

describe('saving and editing again', () => {
  it('saves the editor state, then reloads it for editing and updates in place', async () => {
    const editor = await drawABC()
    editor.details.name = 'Boucle test'
    expect(await editor.save()).toBe('new-route')

    expect(createdBody!.source).toBe('drawn')
    expect(createdBody!.editor_state).toEqual({
      waypoints: [A, B, C],
      segments: [{ mode: 'snap', start: 0, end: 2 }, { mode: 'snap', start: 2, end: 4 }],
    })
    // Saving resets the editor for the next route.
    expect(editor.waypoints).toEqual([])

    expect(createdBody!.way_info!.surface).toEqual([[0, 1, 3], [1, 2, 11], [2, 3, 3], [3, 4, 11]])
    editor.loadRoute(routeDetail(createdBody!))
    expect(editor.editingId).toBe('existing-route')
    expect(editor.waypoints).toEqual([A, B, C])
    expect(editor.track.coordinates).toEqual(createdBody!.coordinates)
    // Split between the segments, then joined again as it was.
    expect(editor.track.wayInfo).toEqual(createdBody!.way_info)
    expect(editor.canEditWaypoint(1)).toBe(true)

    editor.details.is_public = false
    await editor.save()
    expect(updatedBody!.is_public).toBe(false)
    expect(updatedBody!.coordinates).toEqual(createdBody!.coordinates)
  })

  it('loads a route saved before the editor state existed as one locked segment', () => {
    const editor = useRouteEditorStore()
    const legacy = routeDetail({
      name: 'Ancien parcours', sport_type: 'hiking', is_public: true, source: 'gpx_import',
      coordinates: [A, B, C],
    })
    editor.loadRoute(legacy)
    expect(editor.waypoints).toEqual([A, C])
    expect(editor.segments.map(segment => segment.mode)).toEqual(['locked'])
    expect(editor.canEditWaypoint(0)).toBe(false)
  })
})

describe('points of interest', () => {
  it('places them on the track, saves them, and reloads them', async () => {
    const editor = await drawABC()
    editor.placingPoi = true
    // Clicked a little off the track, near the middle of A → B.
    editor.addPoi([6.15, 45.93], 'viewpoint')
    expect(editor.placingPoi).toBe(false)
    expect(editor.pois).toHaveLength(1)
    const [lng, lat] = editor.pois[0]!.coordinates
    // Moved onto the track: the fake routing draws A → B as a straight line.
    expect((lat - A[1]) / (lng - A[0])).toBeCloseTo((B[1] - A[1]) / (B[0] - A[0]), 3)

    editor.pois[0]!.note = '  Vue sur le lac  '
    editor.addPoi(C)
    await editor.save()
    expect(createdBody!.pois).toEqual([
      { type: 'viewpoint', coordinates: [lng, lat], note: 'Vue sur le lac' },
      // An empty note is not sent.
      { type: 'water', coordinates: C },
    ])

    editor.loadRoute(routeDetail(createdBody!))
    expect(editor.pois.map(poi => poi.type)).toEqual(['viewpoint', 'water'])
  })

  it('undoes adding and removing them, and clears them with the track', async () => {
    const editor = await drawABC()
    editor.addPoi(B)
    editor.removePoi(0)
    expect(editor.pois).toHaveLength(0)
    editor.undo()
    expect(editor.pois).toHaveLength(1)
    editor.undo()
    expect(editor.pois).toHaveLength(0)

    editor.addPoi(B)
    editor.clearPoints()
    expect(editor.pois).toHaveLength(0)
  })

  it('needs a track', () => {
    const editor = useRouteEditorStore()
    editor.addWaypoint(A)
    editor.addPoi(A)
    expect(editor.pois).toHaveLength(0)
  })
})
