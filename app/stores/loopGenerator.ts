import type { FetchError } from 'ofetch'
import type { LngLat, RoutingLoopResponse, WayInfo } from '#shared/utils/routes'

export type LoopTarget = 'distance' | 'duration'

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

  const open = ref(false)
  const start = ref<LngLat | null>(null)
  // True while the next click on the map places the start.
  const placingStart = ref(false)
  const target = ref<LoopTarget>('distance')
  const distanceKm = ref(10)
  const durationMin = ref(60)
  const proposals = ref<LoopProposal[]>([])
  // Drawn above the others: hovered in the list, or clicked on the map.
  const highlighted = ref<number | null>(null)
  // Incremented once every proposal of a request has come back, so the map can frame them.
  const settledCount = ref(0)
  // Answers for proposals that were cleared since are ignored.
  let generation = 0

  // The distance asked for: a duration is turned into a distance at the sport's speed on the flat.
  const targetM = computed(() => target.value === 'distance'
    ? Math.round(distanceKm.value * 1000)
    : loopLengthForDuration(editor.details.sport_type, durationMin.value))
  const targetInRange = computed(() => targetM.value >= LOOP_MIN_M && targetM.value <= LOOP_MAX_M)
  const generating = computed(() => proposals.value.some(proposal => proposal.status === 'loading'))
  const canGenerate = computed(() => !!start.value && targetInRange.value && !generating.value && !editor.routingQuotaReached)

  function clearProposals() {
    generation++
    proposals.value = []
    highlighted.value = null
  }

  // Starts from the track's start when there is one.
  function show() {
    open.value = true
    start.value ??= editor.waypoints[0] ?? null
    placingStart.value = !start.value
  }

  function hide() {
    clearProposals()
    open.value = false
    placingStart.value = false
  }

  function setStart([lng, lat]: LngLat) {
    clearProposals()
    start.value = [round(lng), round(lat)]
    placingStart.value = false
  }

  // Proposals routed for another sport would mislead.
  watch(() => editor.details.sport_type, clearProposals)

  // One request per proposal, each with its own seed (direction): they show up as they come back.
  async function generate() {
    if (!canGenerate.value) return
    clearProposals()
    const current = generation
    const firstSeed = Math.floor(Math.random() * (1_000_000 - LOOP_PROPOSALS))
    const body = { start: start.value, length_m: targetM.value, sport_type: editor.details.sport_type }
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
    if (current === generation) settledCount.value++
  }

  // Replaces the editor's track (undo brings it back).
  function choose(index: number) {
    const proposal = proposals.value[index]
    if (proposal?.status !== 'ready') return
    editor.loadLoop(proposal)
    hide()
  }

  return {
    open, start, placingStart, target, distanceKm, durationMin, proposals, highlighted, settledCount,
    targetM, targetInRange, generating, canGenerate,
    show, hide, setStart, generate, choose,
  }
})
