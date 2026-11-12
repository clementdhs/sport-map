import { createError, readBody } from 'h3'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSession } from '#shared/utils/coachSessions'
import type { LoopSentenceSettings } from '#shared/utils/loopSentence'
import type { NamedPlace } from '#shared/utils/loops'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import type { LngLat, RoutingLoopRequest, RoutingSegmentRequest, WayInfo } from '#shared/utils/routes'

const START: LngLat = [6.12, 45.9]

// A square loop from the start, a point every 100 m, as long as asked; climbing `climb` m per point on the first side.
function squareLoop([lng, lat]: LngLat, lengthM: number, climb = 1) {
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
  const elevations = coordinates.map((_, i) => 100 + Math.min(i, steps) * climb)
  return { coordinates, elevations }
}

// Fake loop service: a square of the asked length; the seeds listed in `offTargetSeeds` find no loop, and with a
// quota set, it counts down and answers 429 once it is used up, like the real one.
const loopCalls: RoutingLoopRequest[] = []
const offTargetSeeds = new Set<number>()
// Metres climbed per point on the first side, by seed (1 otherwise).
const climbBySeed = new Map<number, number>()
// Seeds whose loop goes over hills of 400 m at 7 % (#266): 4 points up, 4 down, 2 flat, all along.
const hillySeeds = new Set<number>()
const hilly = (i: number) => 100 + [0, 7, 14, 21, 28, 21, 14, 7, 0, 0][i % 10]!
// Share of path by seed (#295): the loop's first edges are paths, the others roads; no way info otherwise.
const pathBySeed = new Map<number, number>()
function wayInfo(pointCount: number, share: number): WayInfo {
  const pathEdges = Math.round(share * (pointCount - 1))
  return { surface: [], waytype: [[0, pathEdges, 4], [pathEdges, pointCount - 1, 2]], sac_scale: [], mtb_scale: [] }
}
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
    const loop = squareLoop(body.start, body.length_m, climbBySeed.get(body.seed))
    if (hillySeeds.has(body.seed)) loop.elevations = loop.coordinates.map((_, i) => hilly(i))
    const share = pathBySeed.get(body.seed)
    const way = share === undefined ? {} : { way_info: wayInfo(loop.coordinates.length, share) }
    return { ...loop, ...way, quota_remaining: routingQuota ?? 299 }
  },
})

// Overpass, for the place to go through (#214).
const { searchLoopViaMock } = vi.hoisted(() => ({ searchLoopViaMock: vi.fn() }))
mockNuxtImport('searchLoopVia', () => searchLoopViaMock)
const { searchNamedPlacesMock } = vi.hoisted(() => ({ searchNamedPlacesMock: vi.fn() }))
mockNuxtImport('searchNamedPlaces', () => searchNamedPlacesMock)

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
  climbBySeed.clear()
  hillySeeds.clear()
  pathBySeed.clear()
  searchLoopViaMock.mockReset()
  searchNamedPlacesMock.mockReset()
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
    // Rolling by default: 27.5 m per km add 2.75 min to the 12 per km on the flat (#214).
    expect(loop.targetM).toBe(6102)
    await loop.generate()
    expect(loopCalls[0]!.length_m).toBe(6102)
    loop.climb = 'hilly'
    expect(loop.targetM).toBe(5294)
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
    // Missing proposals go last.
    expect(loop.proposals.map(proposal => proposal.status)).toEqual(['ready', 'ready', 'failed'])
    expect(loop.proposals[2]!.error).toBe('Pas de boucle de cette distance dans cette direction')
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

  it('sends the shape and the precision (#214)', async () => {
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    await loop.generate()
    expect(loopCalls.every(call => call.shape === 'loop' && call.precision === 'precise' && !call.via)).toBe(true)

    loop.shape = 'out_and_back'
    await nextTick()
    expect(loop.proposals).toEqual([])
    loop.precision = 'range'
    loopCalls.length = 0
    await loop.generate()
    expect(loopCalls.every(call => call.shape === 'out_and_back' && call.precision === 'range')).toBe(true)
  })

  it('ranks the proposals by climbing, again without a request when it changes (#214)', async () => {
    climbBySeed.set(0, 1).set(1, 5).set(2, 3)
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.climb = 'hilly'
    await loop.generate()
    expect(loop.proposals.map(proposal => proposal.seed)).toEqual([1, 2, 0])

    loop.highlighted = 0
    loop.climb = 'flat'
    await nextTick()
    expect(loop.proposals.map(proposal => proposal.seed)).toEqual([0, 2, 1])
    // The highlighted proposal (seed 1) stays highlighted where it moved.
    expect(loop.highlighted).toBe(2)
    expect(loopCalls).toHaveLength(3)
  })

  it('aims at a gain without a distance: a length from the sport, the loops closest to the gain first (#294)', async () => {
    const editor = useRouteEditorStore()
    editor.details.sport_type = 'cycling'
    // 32 km: 80 points a side, so 80 m of gain per metre climbed per point.
    climbBySeed.set(0, 2).set(1, 7).set(2, 12)
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.target = 'gain'
    loop.gainM = 600
    await loop.generate()
    expect(loopCalls[0]!.length_m).toBe(32_000)
    expect(loop.proposals.map(proposal => proposal.seed)).toEqual([1, 2, 0])
    expect(loop.gainMissed).toBeNull()

    // Another gain ranks them again, without a request.
    loop.gainM = 1000
    await nextTick()
    expect(loop.proposals.map(proposal => proposal.seed)).toEqual([2, 1, 0])
    expect(loopCalls).toHaveLength(3)
  })

  it('keeps the distance when asked to, with the gain (#294)', async () => {
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.target = 'gain'
    loop.gainWithDistance = true
    loop.distanceKm = 40
    await loop.generate()
    expect(loopCalls[0]!.length_m).toBe(40_000)
  })

  it('says when the terrain is too flat for the gain asked for (#294)', async () => {
    const editor = useRouteEditorStore()
    editor.details.sport_type = 'cycling'
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.target = 'gain'
    loop.gainM = 600
    await loop.generate()
    // About 80 m each (the gain is smoothed).
    expect(loop.gainMissed?.direction).toBe('low')
    expect(loop.gainMissed!.closestM).toBeLessThan(100)
  })

  it('keeps the gain within what the sport can climb in 100 km (#294)', () => {
    const editor = useRouteEditorStore()
    editor.details.sport_type = 'road_cycling'
    const loop = useLoopGeneratorStore()
    loop.target = 'gain'
    loop.gainM = 3000
    expect(loop.gainTargetM).toBe(1500)
    expect(loop.targetM).toBe(100_000)
  })

  it('asks for paths and ranks the proposals with the most path first, each with its share (#295)', async () => {
    pathBySeed.set(0, 0.2).set(1, 0.7).set(2, 0.45)
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.preferPaths = true
    await loop.generate()
    expect(loopCalls.every(call => call.prefer_paths === true)).toBe(true)
    expect(loop.proposals.map(proposal => proposal.seed)).toEqual([1, 2, 0])
    expect(loop.proposals[0]!.pathShare).toBeCloseTo(0.7, 1)
  })

  it('clears the proposals when the option changes the profile, ranks them again when it does not (#295)', async () => {
    pathBySeed.set(0, 0.2).set(1, 0.7).set(2, 0.45)
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    // Running: foot-walking, foot-hiking with paths.
    await loop.generate()
    loop.preferPaths = true
    expect(loop.proposals).toEqual([])

    // Hiking is on foot-hiking either way: ranking again costs no request.
    editor.details.sport_type = 'hiking'
    loop.preferPaths = false
    await loop.generate()
    loop.preferPaths = true
    await nextTick()
    expect(loop.proposals.map(proposal => proposal.seed)).toEqual([1, 2, 0])
    expect(loopCalls).toHaveLength(6)
  })

  it('never asks road rides for paths (#295)', async () => {
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    editor.details.sport_type = 'road_cycling'
    loop.setStart(START)
    loop.preferPaths = true
    expect(loop.pathsActive).toBe(false)
    await loop.generate()
    expect(loopCalls.some(call => call.prefer_paths)).toBe(false)
  })

  it('goes through the highest peak in reach, searched once (#214)', async () => {
    const peak = (id: string, lat: number, ele: number): OsmPlace => ({ id, type: 'peak', coordinates: [6.12, lat], ele, name: id })
    searchLoopViaMock.mockResolvedValue([peak('low', 45.91, 900), peak('high', 45.92, 1400)])
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.via = 'peak'
    await loop.generate()

    // 10 km within 10 %: 11 km there and back, 4.2 km as the crow flies.
    expect(searchLoopViaMock).toHaveBeenCalledWith('peak', START, 4231)
    expect(loop.viaStatus).toBe('found')
    expect(loop.viaPlace?.id).toBe('high')
    expect(loopCalls.every(call => call.via?.[1] === 45.92)).toBe(true)

    await loop.generate()
    expect(searchLoopViaMock).toHaveBeenCalledTimes(1)
    expect(loop.viaPlace?.id).toBe('high')
  })

  it('goes through a named river in reach, at its point nearest to the start (#293)', async () => {
    const river: NamedPlace = { id: 'w1', name: 'L\'Isère', kind: 'river', coordinates: [6.11, 45.905], distanceM: 1200 }
    searchNamedPlacesMock.mockResolvedValue([river])
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.via = 'named'
    loop.viaName = 'l\'Isère'
    await loop.generate()

    expect(searchNamedPlacesMock).toHaveBeenCalledWith('l\'Isère', START)
    expect(loop.viaStatus).toBe('found')
    expect(loop.namedChoice).toEqual({ role: 'via', place: river })
    expect(loop.viaPoint).toEqual(river.coordinates)
    expect(loopCalls.every(call => call.via?.[0] === 6.11 && call.heading === undefined)).toBe(true)

    await loop.generate()
    expect(searchNamedPlacesMock).toHaveBeenCalledTimes(1)
  })

  it('only heads for a named massif, sending its bearing (#293)', async () => {
    searchNamedPlacesMock.mockResolvedValue([
      { id: 'r1', name: 'Massif de la Chartreuse', kind: 'massif', coordinates: [6.1, 46.1], distanceM: 22000 },
    ] satisfies NamedPlace[])
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.via = 'named'
    loop.viaName = 'la Chartreuse'
    await loop.generate()

    expect(loop.namedChoice?.role).toBe('heading')
    expect(loop.viaPoint).toBeNull()
    expect(loopCalls).toHaveLength(3)
    expect(loopCalls.every(call => !call.via && typeof call.heading === 'number' && Math.abs(call.heading) < 10)).toBe(true)
  })

  it('goes without a named place it cannot find (#293)', async () => {
    searchNamedPlacesMock.mockResolvedValue([])
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.via = 'named'
    loop.viaName = 'Atlantide'
    await loop.generate()
    expect(loop.viaStatus).toBe('none')
    expect(loop.proposals.map(proposal => proposal.status)).toEqual(['ready', 'ready', 'ready'])
    expect(loopCalls.every(call => !call.via && call.heading === undefined)).toBe(true)
  })

  it('does not look for a place said by its kind only, and says so (#293)', async () => {
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.via = 'named'
    loop.viaName = 'le lac'
    await loop.generate()
    expect(searchNamedPlacesMock).not.toHaveBeenCalled()
    expect(loop.viaStatus).toBe('vague')
    expect(loop.proposals).toHaveLength(3)
  })

  it('goes without a place when none is in reach or Overpass fails (#214)', async () => {
    searchLoopViaMock.mockResolvedValue([])
    const loop = useLoopGeneratorStore()
    loop.setStart(START)
    loop.via = 'water'
    await loop.generate()
    expect(loop.viaStatus).toBe('none')
    expect(loop.proposals.map(proposal => proposal.status)).toEqual(['ready', 'ready', 'ready'])
    expect(loopCalls.every(call => !call.via)).toBe(true)

    searchLoopViaMock.mockRejectedValue(new Error('busy'))
    loop.setStart([6.2, 45.9])
    await loop.generate()
    expect(loop.viaStatus).toBe('failed')
    expect(loop.proposals).toHaveLength(3)
  })

  it('shares the start with the hand-drawn mode', () => {
    const editor = useRouteEditorStore()
    editor.snapToPaths = false
    const loop = useLoopGeneratorStore()
    loop.show()
    loop.setStart(START)

    // An empty track starts from the loop's start, which undo removes.
    loop.switchToManual()
    expect(loop.open).toBe(false)
    expect(editor.waypoints).toEqual([START])
    editor.undo()
    expect(editor.waypoints).toEqual([])

    // A drawn track's start wins over the loop's.
    const drawn: [number, number] = [6.2, 45.95]
    editor.addWaypoint(drawn)
    loop.show()
    expect(loop.start).toEqual(drawn)
    loop.switchToManual()
    expect(editor.waypoints).toEqual([drawn])

    // Leaving the editor forgets it.
    loop.leave()
    editor.clearPoints()
    loop.show()
    expect(loop.start).toBeNull()
    expect(loop.placingStart).toBe(true)
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

describe('session mode (#266)', () => {
  it('aims at the session distance with plain loops, ranked by the session gain', async () => {
    const editor = useRouteEditorStore()
    editor.details.sport_type = 'hiking'
    const loop = useLoopGeneratorStore()
    loop.shape = 'out_and_back'
    loop.precision = 'range'
    loop.showSession()
    expect(loop.forSession).toBe(true)
    expect(editor.details.sport_type).toBe('running')
    // No request before the session is known.
    loop.setStart(START)
    expect(loop.canGenerate).toBe(false)

    const plan = buildSession('endurance', 60, 6)
    loop.setSession(plan)
    climbBySeed.set(0, 4).set(1, 0.5).set(2, 2)
    await loop.generate()
    expect(loopCalls).toHaveLength(3)
    expect(loopCalls.every(call => call.length_m === Math.round(plan.distanceM) && call.sport_type === 'running'
      && call.shape === 'loop' && call.precision === 'precise' && !call.via)).toBe(true)
    // Endurance climbs about 5 m/km: seed 2 (~5 m/km) first, then the flatter seed 1, the hilliest last.
    expect(loop.proposals.map(proposal => proposal.seed)).toEqual([2, 1, 0])
    expect(loop.proposals.every(proposal => proposal.climbs === null)).toBe(true)
    expect(loop.picked).toBe(0)
  })

  it('puts first the loop with the climbs a hill session needs', async () => {
    hillySeeds.add(2)
    const loop = useLoopGeneratorStore()
    loop.showSession()
    const plan = buildSession('longHills', 60, 6)
    loop.setSession(plan)
    loop.setStart(START)
    await loop.generate()
    expect(loop.proposals[0]!.seed).toBe(2)
    expect(loop.proposals[0]!.climbs!.length).toBeGreaterThanOrEqual(plan.reps!.count)
    expect(loop.proposals.slice(1).every(proposal => proposal.climbs!.length === 0)).toBe(true)
  })

  it('keeps its proposals when the editor resets its sport, and clears them with another session', async () => {
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    loop.showSession()
    loop.setSession(buildSession('endurance', 60, 6))
    loop.setStart(START)
    await loop.generate()
    // Saving the route resets the editor's details.
    editor.details.sport_type = 'hiking'
    await nextTick()
    expect(loop.proposals).toHaveLength(3)

    loop.setSession(buildSession('endurance', 45, 6))
    expect(loop.proposals).toEqual([])
  })

  it('leaves the session behind in the other modes', () => {
    const loop = useLoopGeneratorStore()
    loop.showSession()
    loop.setSession(buildSession('endurance', 60, 6))
    loop.show()
    expect(loop.forSession).toBe(false)
    expect(loop.session).toBeNull()
    expect(loop.targetM).toBe(10_000)

    loop.showSession()
    loop.fromCoach = true
    loop.leave()
    expect(loop.fromCoach).toBe(false)
    expect(loop.open).toBe(false)
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

describe('settings from a sentence (#216)', () => {
  const settings = (fields: Partial<LoopSentenceSettings>): LoopSentenceSettings => ({
    sport: null, target: null, precision: null, shape: null, climb: null, start: null, place: null, paths: null, gain: null, ignored: [], ...fields,
  })

  it('fills the sport, distance, precision, shape and climbing, and says which settings changed', () => {
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    loop.show()
    const changed = loop.applySentence(settings({
      sport: 'hiking', target: { kind: 'distance', km: 15 }, precision: 'range', shape: 'out_and_back', climb: 'hilly',
    }))
    expect(editor.details.sport_type).toBe('hiking')
    expect(loop.target).toBe('distance')
    expect(loop.distanceKm).toBe(15)
    expect(loop.precision).toBe('range')
    expect(loop.shape).toBe('out_and_back')
    expect(loop.climb).toBe('hilly')
    expect(changed.sort()).toEqual(['climb', 'precision', 'shape', 'sport', 'target'])
  })

  it('prefers paths when the sentence asks for them (#295)', () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    expect(loop.applySentence(settings({ paths: true }))).toEqual(['paths'])
    expect(loop.preferPaths).toBe(true)
    // Not said: left as it is.
    expect(loop.applySentence(settings({ climb: 'flat' }))).toEqual(['climb'])
    expect(loop.preferPaths).toBe(true)
  })

  it('leaves the paths off for a road ride, which has no such option (#295)', () => {
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    loop.show()
    editor.details.sport_type = 'road_cycling'
    expect(loop.applySentence(settings({ paths: true }))).toEqual([])
    expect(loop.preferPaths).toBe(false)
  })

  it('switches to a duration when the sentence gives one', () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    loop.applySentence(settings({ target: { kind: 'duration', min: 45 } }))
    expect(loop.target).toBe('duration')
    expect(loop.durationMin).toBe(45)
  })

  it('leaves the settings the sentence does not mention, and the ones already as asked, unmarked', () => {
    const editor = useRouteEditorStore()
    const loop = useLoopGeneratorStore()
    loop.show()
    editor.details.sport_type = 'trail'
    loop.climb = 'flat'
    loop.precision = 'range'
    const changed = loop.applySentence(settings({ target: { kind: 'distance', km: 8 }, climb: 'flat' }))
    expect(editor.details.sport_type).toBe('trail')
    expect(loop.precision).toBe('range')
    expect(loop.shape).toBe('loop')
    expect(changed).toEqual(['target'])
  })

  it('clears the proposals of the former settings, so new ones can be asked for', async () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    loop.setStart(START)
    const pending = loop.generate()
    expect(loop.canGenerate).toBe(false)
    loop.applySentence(settings({ target: { kind: 'distance', km: 6 } }))
    expect(loop.proposals).toEqual([])
    expect(loop.canGenerate).toBe(true)
    await pending
    expect(loop.proposals).toEqual([])
  })

  it('keeps its target when the answer has no gain field (#294)', () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    const { gain: _, ...withoutGain } = settings({ climb: 'hilly' })
    loop.applySentence(withoutGain as LoopSentenceSettings)
    expect(loop.target).toBe('distance')
    expect(loop.climb).toBe('hilly')
  })

  it('fills a gain alone, the length then deduced from it (#294)', () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    loop.gainWithDistance = true
    const changed = loop.applySentence(settings({ gain: 600 }))
    expect(loop.target).toBe('gain')
    expect(loop.gainM).toBe(600)
    expect(loop.gainWithDistance).toBe(false)
    expect(changed).toEqual(['target'])
  })

  it('fills a gain with the distance of the sentence (#294)', () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    loop.applySentence(settings({ target: { kind: 'distance', km: 40 }, gain: 600 }))
    expect(loop.target).toBe('gain')
    expect(loop.gainWithDistance).toBe(true)
    expect(loop.distanceKm).toBe(40)
    expect(loop.targetM).toBe(40_000)
    // The same sentence again changes nothing.
    expect(loop.applySentence(settings({ target: { kind: 'distance', km: 40 }, gain: 600 }))).toEqual([])
  })

  it('fills the named place to go through (#293)', () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    const changed = loop.applySentence(settings({ place: { name: 'Isère', text: 'autour de l\'Isère' } }))
    expect(loop.via).toBe('named')
    expect(loop.viaName).toBe('Isère')
    expect(changed).toEqual(['via'])
  })

  it('keeps the proposals generated right after it', async () => {
    const loop = useLoopGeneratorStore()
    loop.show()
    loop.setStart(START)
    loop.applySentence(settings({ sport: 'trail', target: { kind: 'distance', km: 6 }, shape: 'loop' }))
    await loop.generate()
    expect(loop.proposals.filter(proposal => proposal.status === 'ready')).toHaveLength(3)
    expect(loopCalls.every(call => call.sport_type === 'trail' && call.length_m === 6000)).toBe(true)
  })
})
