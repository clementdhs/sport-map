import { readBody } from 'h3'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteDetail } from '#shared/types/routes'
import type { LngLat, RouteCreatePayload, RoutingSegmentRequest } from '#shared/utils/routes'

// Fake routing service: a straight line through the midpoint, 100 m → 150 m → 200 m of elevation.
const routingCalls: RoutingSegmentRequest[] = []
registerEndpoint('/api/routing/segment', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<RoutingSegmentRequest>(event)
    routingCalls.push(body)
    const { from, to } = body
    const mid: LngLat = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
    return { coordinates: [from, mid, to], elevations: [100, 150, 200], snapped: true }
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
    owner_id: 'me',
    geometry: { type: 'LineString', coordinates: body.coordinates },
    elevation_profile: body.elevations ?? null,
    editor_state: body.editor_state ?? null,
    owner: { username: 'test', display_name: null },
    viewer: null,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  routingCalls.length = 0
  createdBody = undefined
  updatedBody = undefined
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

  it('uses the straight mode when snapping is off', async () => {
    const editor = useRouteEditorStore()
    editor.snapToPaths = false
    editor.addWaypoint(A)
    editor.addWaypoint(B)
    await settled(editor)
    expect(routingCalls[0]!.mode).toBe('straight')
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

    editor.loadRoute(routeDetail(createdBody!))
    expect(editor.editingId).toBe('existing-route')
    expect(editor.waypoints).toEqual([A, B, C])
    expect(editor.track.coordinates).toEqual(createdBody!.coordinates)
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
