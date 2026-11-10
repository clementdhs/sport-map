import type { FetchError } from 'ofetch'
import type { LoopClimb, LoopViaType } from '#shared/utils/loops'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import type { LngLat, LoopPrecision, LoopShape, RoutingLoopRequest, RoutingLoopResponse, WayInfo } from '#shared/utils/routes'

export type LoopTarget = 'distance' | 'duration'
export type LoopVia = 'none' | LoopViaType
// The search of the place to go through: 'none' when there is none in reach, 'failed' when Overpass didn't answer.
export type LoopViaStatus = 'idle' | 'searching' | 'found' | 'none' | 'failed'

export interface LoopProposal {
  seed: number
  status: 'loading' | 'ready' | 'failed'
  coordinates: LngLat[]
  elevations: number[] | null
  wayInfo: WayInfo | null
  distanceM: number
  gainM: number | null
  // Why no loop came back, in the user's language
  error: string | null
}

const round = (value: number) => Math.round(value * 1e6) / 1e6

// Automatic loops of the route editor (#50): a start, a distance or a duration, and a few proposals drawn on
// the map, one of which becomes the editor's track.
export const useLoopGeneratorStore = defineStore('loopGenerator', () => {
  const editor = useRouteEditorStore()
  const preferences = usePreferencesStore()

  const open = ref(false)
  const start = ref<LngLat | null>(null)
  // True while the next click on the map places the start.
  const placingStart = ref(false)
  const target = ref<LoopTarget>('distance')
  const distanceKm = ref(10)
  const durationMin = ref(60)
  // Options of #214: out and back, wider tolerance, climbing (ranks the proposals), a place to go through.
  const shape = ref<LoopShape>('loop')
  const precision = ref<LoopPrecision>('precise')
  const climb = ref<LoopClimb>('rolling')
  const via = ref<LoopVia>('none')
  const viaStatus = ref<LoopViaStatus>('idle')
  const viaPlace = ref<OsmPlace | null>(null)
  // How far the place was looked for (m).
  const viaRadiusM = ref(0)
  // The last Overpass answer: "Autres propositions" doesn't ask again.
  let viaSearch: { key: string, places: OsmPlace[] } | null = null
  const proposals = ref<LoopProposal[]>([])
  // Drawn above the others: hovered in the list, or clicked on the map.
  const highlighted = ref<number | null>(null)
  // Incremented once every proposal of a request has come back, so the map can frame them.
  const settledCount = ref(0)
  // Answers for proposals that were cleared since are ignored.
  let generation = 0
  // True from the click until the proposals are ranked: the panel picks the first one only once they are.
  const ranking = ref(false)

  // The distance asked for: a duration is turned into a distance at the member's pace (#146), climbing as much as
  // the chosen climbing usually does (#214).
  const gainPerKmM = computed(() => typicalGainPerKm(editor.details.sport_type, climb.value))
  const targetM = computed(() => target.value === 'distance'
    ? Math.round(distanceKm.value * 1000)
    : loopLengthForDuration(editor.details.sport_type, durationMin.value, preferences.values.paces[editor.details.sport_type], gainPerKmM.value))
  const targetInRange = computed(() => targetM.value >= LOOP_MIN_M && targetM.value <= LOOP_MAX_M)
  const generating = computed(() => ranking.value || viaStatus.value === 'searching' || proposals.value.some(proposal => proposal.status === 'loading'))
  const canGenerate = computed(() => !!start.value && targetInRange.value && !generating.value && !editor.routingQuotaReached)

  function clearProposals() {
    generation++
    ranking.value = false
    proposals.value = []
    highlighted.value = null
    viaStatus.value = 'idle'
    viaPlace.value = null
  }

  // The highlighted proposal stays highlighted where it moves.
  function rank() {
    const seed = highlighted.value === null ? null : proposals.value[highlighted.value]?.seed
    proposals.value = rankByClimb(proposals.value, editor.details.sport_type, climb.value)
    const index = proposals.value.findIndex(proposal => proposal.seed === seed)
    highlighted.value = index < 0 ? null : index
  }

  // The place the proposals go through, searched in OpenStreetMap around the start; null without one.
  async function findVia(type: LoopViaType, from: LngLat, current: number): Promise<OsmPlace | null> {
    const radiusM = viaSearchRadius(targetM.value, LOOP_TOLERANCES[precision.value])
    const key = `${type}:${from.join(',')}:${radiusM}`
    viaRadiusM.value = radiusM
    viaStatus.value = 'searching'
    let places: OsmPlace[]
    try {
      places = viaSearch?.key === key ? viaSearch.places : await searchLoopVia(type, from, radiusM)
      viaSearch = { key, places }
    }
    catch {
      if (current === generation) viaStatus.value = 'failed'
      return null
    }
    if (current !== generation) return null
    const place = pickLoopVia(type, places, from, radiusM)
    viaPlace.value = place
    viaStatus.value = place ? 'found' : 'none'
    return place
  }

  // The start is shared with the hand-drawn mode (#215): the track's start when there is one.
  function show() {
    open.value = true
    start.value = editor.waypoints[0] ?? start.value
    placingStart.value = !start.value
  }

  function hide() {
    clearProposals()
    open.value = false
    placingStart.value = false
  }

  // Leaving the editor: a draft keeps its start in its track, and a saved route mustn't lend its own to the next one.
  function leave() {
    hide()
    start.value = null
  }

  // Back to drawing by hand: an empty track starts from the loop's start (undo removes it).
  function switchToManual() {
    hide()
    if (start.value && !editor.waypoints.length) editor.addWaypoint(start.value)
  }

  function setStart([lng, lat]: LngLat) {
    clearProposals()
    start.value = [round(lng), round(lat)]
    placingStart.value = false
  }

  // Proposals routed for another sport, or of another shape, would mislead.
  // Synchronous: a change made just before generate() mustn't clear the new proposals.
  watch([() => editor.details.sport_type, shape, via], clearProposals, { flush: 'sync' })
  // Ranking again costs no request.
  watch(climb, () => {
    if (proposals.value.length && !generating.value) rank()
  })

  // One request per proposal, each with its own seed (direction): they show up as they come back, then are ranked
  // by climbing. A place to go through is looked for first; without one in reach, the proposals go without.
  async function generate() {
    if (!canGenerate.value || !start.value) return
    clearProposals()
    ranking.value = true
    const current = generation
    const from = start.value
    const place = via.value === 'none' ? null : await findVia(via.value, from, current)
    if (current !== generation) return
    const firstSeed = Math.floor(Math.random() * (1_000_000 - LOOP_PROPOSALS))
    const body: Omit<RoutingLoopRequest, 'seed'> = {
      start: from,
      length_m: targetM.value,
      sport_type: editor.details.sport_type,
      shape: shape.value,
      precision: precision.value,
      ...(place ? { via: place.coordinates } : {}),
    }
    proposals.value = Array.from({ length: LOOP_PROPOSALS }, (_, i): LoopProposal => ({
      seed: firstSeed + i,
      status: 'loading',
      coordinates: [],
      elevations: null,
      wayInfo: null,
      distanceM: 0,
      gainM: null,
      error: null,
    }))
    await Promise.all(proposals.value.map(async ({ seed }, i) => {
      try {
        const result = await $fetch<RoutingLoopResponse>('/api/routing/loop', { method: 'POST', body: { ...body, seed } })
        if (current !== generation) return
        editor.routingQuotaRemaining = result.quota_remaining
        Object.assign(proposals.value[i]!, {
          status: 'ready',
          coordinates: result.coordinates,
          elevations: result.elevations,
          wayInfo: result.way_info ?? null,
          distanceM: trackDistances(result.coordinates).at(-1) ?? 0,
          gainM: elevationStats(result.coordinates, result.elevations).gain,
        })
      }
      catch (error) {
        if (current !== generation) return
        editor.isRoutingQuotaError(error)
        Object.assign(proposals.value[i]!, {
          status: 'failed',
          error: (error as FetchError).data?.statusMessage ?? (error as Error).message,
        })
      }
    }))
    if (current !== generation) return
    rank()
    ranking.value = false
    settledCount.value++
  }

  // Replaces the editor's track (undo brings it back).
  function choose(index: number) {
    const proposal = proposals.value[index]
    if (proposal?.status !== 'ready') return
    editor.loadLoop(proposal)
    hide()
  }

  return {
    open, start, placingStart, target, distanceKm, durationMin, shape, precision, climb, via, viaStatus, viaPlace,
    viaRadiusM, proposals, highlighted, settledCount,
    gainPerKmM, targetM, targetInRange, generating, canGenerate,
    show, hide, leave, switchToManual, setStart, generate, choose,
  }
})
