import { createError, readBody } from 'h3'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LngLat, RoutingLoopRequest, RoutingSegmentRequest } from '#shared/utils/routes'

const START: LngLat = [6.12, 45.9]

// A square loop from the start, a point every 100 m, as long as asked; climbing 1 m per point on the first side.
function squareLoop([lng, lat]: LngLat, lengthM: number) {
  const dLat = 100 / 111_320
  const dLng = dLat / Math.cos(lat * Math.PI / 180)
  const steps = Math.round(lengthM / 400)
  const coordinates: LngLat[] = [[lng, lat]]
  let [x, y] = [0, 0]
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
    for (let i = 0; i < steps; i++) {
      x += dx
      y += dy
      coordinates.push([lng + x * dLng, lat + y * dLat])
    }
  }
  const elevations = coordinates.map((_, i) => 100 + Math.min(i, steps))
  return { coordinates, elevations }
}

// Fake loop service: a square of the asked length; the seeds listed in `offTargetSeeds` find no loop, and with a
// quota set, it counts down and answers 429 once it is used up, like the real one.
const loopCalls: RoutingLoopRequest[] = []
const offTargetSeeds = new Set<number>()
let routingQuota: number | null = null
registerEndpoint('/api/routing/loop', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<RoutingLoopRequest>(event)
    loopCalls.push(body)
    if (routingQuota !== null && routingQuota <= 0) {
      throw createError({ statusCode: 429, statusMessage: 'Limite atteinte', data: { reason: ROUTING_QUOTA_REASON } })
    }
    if (routingQuota !== null) routingQuota--
    if (offTargetSeeds.has(body.seed)) {
      throw createError({ statusCode: 422, statusMessage: 'Pas de boucle de cette distance dans cette direction' })
    }
    return { ...squareLoop(body.start, body.length_m), quota_remaining: routingQuota ?? 299 }
  },
})

const segmentCalls: RoutingSegmentRequest[] = []
registerEndpoint('/api/routing/segment', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<RoutingSegmentRequest>(event)
    segmentCalls.push(body)
    return { coordinates: [body.from, body.to], elevations: [100, 100], snapped: true }
  },
})

beforeEach(() => {
  setActivePinia(createPinia())
  loopCalls.length = 0
  segmentCalls.length = 0
  offTargetSeeds.clear()
  routingQuota = null
  // Seeds 0, 1 and 2.
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('starting point', () => {
  it('waits for a click on the map, or starts from the track', () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    expect(loop.placingStart).toBe(true)
    expect(loop.canGenerate).toBe(false)
    loop.setStart([6.123456789, 45.9])
    expect(loop.start).toEqual([6.123457, 45.9])
    expect(loop.placingStart).toBe(false)
    expect(loop.canGenerate).toBe(true)

    setActivePinia(createPinia())
    const editor = useRouteEditorStore()
    editor.snapToPaths = false
    editor.addWaypoint(START)
    const other = useLoopGeneratorStore()
    other.show()
    expect(other.start).toEqual(START)
    expect(other.placingStart).toBe(false)
  })
})

describe('proposals', () => {
  it('asks for three loops of the distance, one seed each, and sums them up', async () => {
    const editor = useRouteEditorStore()
    editor.details.sport_type = 'trail'
    const loop = useLoopGeneratorStore()
    loop.show()
    loop.setStart(START)
    loop.distanceKm = 8
    await loop.generate()

    expect(loopCalls.map(call => call.seed).sort()).toEqual([0, 1, 2])
    expect(loopCalls.every(call => call.length_m === 8000 && call.sport_type === 'trail')).toBe(true)
    expect(loop.proposals.map(proposal => proposal.status)).toEqual(['ready', 'ready', 'ready'])
    const [first] = loop.proposals
    expect(Math.abs(first!.distanceM - 8000)).toBeLessThan(800)
    expect(first!.gainM).toBeGreaterThan(0)
    expect(editor.routingQuotaRemaining).toBe(299)
    expect(loop.settledCount).toBe(1)
  })

  it('turns a duration into a distance at the sport speed', async () => {
    const editor = useRouteEditorStore()
    editor.details.sport_type = 'hiking'
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.target = 'duration'
    loop.durationMin = 90
    expect(loop.targetM).toBe(7500)
    await loop.generate()
    expect(loopCalls[0]!.length_m).toBe(7500)
  })

  it('refuses distances the service can\'t loop', () => {
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.distanceKm = 120
    expect(loop.targetInRange).toBe(false)
    expect(loop.canGenerate).toBe(false)
  })

  it('shows why a proposal is missing', async () => {
    offTargetSeeds.add(1)
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    await loop.generate()
    expect(loop.proposals.map(proposal => proposal.status)).toEqual(['ready', 'failed', 'ready'])
    expect(loop.proposals[1]!.error).toBe('Pas de boucle de cette distance dans cette direction')
  })

  it('stops at the daily quota, warning once', async () => {
    routingQuota = 1
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    await loop.generate()
    expect(loop.proposals.filter(proposal => proposal.status === 'ready')).toHaveLength(1)
    expect(editor.routingQuotaReached).toBe(true)
    expect(loop.canGenerate).toBe(false)
  })

  it('clears the proposals when the start or the sport changes', async () => {
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    await loop.generate()
    loop.highlighted = 1
    loop.setStart([6.2, 45.9])
    expect(loop.proposals).toEqual([])
    expect(loop.highlighted).toBeNull()

    await loop.generate()
    editor.details.sport_type = 'mountain_biking'
    await nextTick()
    expect(loop.proposals).toEqual([])
  })

  it('ignores answers for proposals cleared meanwhile', async () => {
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    const pending = loop.generate()
    loop.hide()
    await pending
    expect(loop.proposals).toEqual([])
    expect(loop.settledCount).toBe(0)
  })
})

describe('choosing a proposal', () => {
  it('makes it an editable track of snapped segments, which undo removes', async () => {
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    loop.show()
    loop.setStart(START)
    loop.distanceKm = 10
    await loop.generate()
    const chosen = loop.proposals[2]!
    const chosenCoordinates = chosen.coordinates
    loop.choose(2)

    expect(loop.open).toBe(false)
    expect(loop.proposals).toEqual([])
    expect(editor.track.coordinates).toEqual(chosenCoordinates)
    expect(editor.track.elevations).toHaveLength(chosenCoordinates.length)
    expect(editor.segments).toHaveLength(5)
    expect(editor.segments.every(segment => segment.mode === 'snap' && !segment.loading)).toBe(true)
    expect(editor.waypoints[0]).toEqual(editor.waypoints.at(-1))
    expect(editor.isLoop).toBe(true)
    expect(segmentCalls).toHaveLength(0)

    // Moving a waypoint routes only its two segments again.
    editor.moveWaypoint(2, [6.13, 45.91])
    await vi.waitFor(() => expect(editor.isRouting).toBe(false))
    expect(segmentCalls).toHaveLength(2)

    editor.undo()
    editor.undo()
    expect(editor.waypoints).toEqual([])
  })
})
