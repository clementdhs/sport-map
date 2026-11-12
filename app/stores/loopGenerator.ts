import type { FetchError } from 'ofetch'
import type { SessionPlan } from '#shared/utils/coachSessions'
import type { Climb } from '#shared/utils/slopes'
import type { LoopClimb, LoopViaType, NamedPlace, NamedPlaceChoice } from '#shared/utils/loops'
import type { LoopSentenceSettings } from '#shared/utils/loopSentence'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import type { LngLat, LoopPrecision, LoopShape, RoutingLoopRequest, RoutingLoopResponse, WayInfo } from '#shared/utils/routes'

// 'gain': a gain in metres (#294), the length deduced from it unless `gainWithDistance` keeps the distance too.
export type LoopTarget = 'distance' | 'duration' | 'gain'
// 'named': a place the member names (#293), gone through or headed for.
export type LoopVia = 'none' | LoopViaType | 'named'
// The settings a sentence can fill (#216), marked in the panel once it did.
// 'gain' (#294) only names its chip: the gain is set in the target's row, marked as 'target'.
export type LoopSentenceSetting = 'sport' | 'target' | 'gain' | 'precision' | 'shape' | 'climb' | 'via' | 'paths'
// The search of the place to go through: 'none' when there is none in reach, 'failed' when Overpass didn't answer,
// 'vague' for a named place said by its kind only (« le lac »), not looked for (#293).
export type LoopViaStatus = 'idle' | 'searching' | 'found' | 'none' | 'failed' | 'vague'

export interface LoopProposal {
  seed: number
  status: 'loading' | 'ready' | 'failed'
  coordinates: LngLat[]
  elevations: number[] | null
  wayInfo: WayInfo | null
  distanceM: number
  gainM: number | null
  // Share of the length on unpaved ways and trails (#295), null without way info
  pathShare: number | null
  // In the session mode (#266), the climbs fit for the session's hill repeats (none for other sessions)
  climbs: Climb[] | null
  // Why no loop came back, in the user's language
  error: string | null
}

const round = (value: number) => Math.round(value * 1e6) / 1e6

// Automatic loops of the route editor (#50): a start, a distance or a duration, and a few proposals drawn on
// the map, one of which becomes the editor's track.
export const useLoopGeneratorStore = defineStore('loopGenerator', () => {
  const editor = useRouteEditorStore()
  const preferences = usePreferencesStore()
  const { $i18n } = useNuxtApp()

  const open = ref(false)
  // The "Séance" mode of the panel (#266): the loops aim at the coach's session of the day, `session` once it is
  // worked out. `fromCoach`: opened by "Générer le tracé depuis chez moi", whose click asks for the loops.
  const forSession = ref(false)
  const session = ref<SessionPlan | null>(null)
  const fromCoach = ref(false)
  const start = ref<LngLat | null>(null)
  // True while the next click on the map places the start.
  const placingStart = ref(false)
  const target = ref<LoopTarget>('distance')
  const distanceKm = ref(10)
  const durationMin = ref(60)
  const gainM = ref(600)
  const gainWithDistance = ref(false)
  // Options of #214: out and back, wider tolerance, climbing (ranks the proposals), a place to go through.
  const shape = ref<LoopShape>('loop')
  const precision = ref<LoopPrecision>('precise')
  const climb = ref<LoopClimb>('rolling')
  const via = ref<LoopVia>('none')
  // Paths rather than tarmac (#295): a profile that takes more paths, and the proposals ranked by their share of it.
  const preferPaths = ref(false)
  const pathsActive = computed(() => preferPaths.value && canPreferPaths(editor.details.sport_type))
  const viaStatus = ref<LoopViaStatus>('idle')
  const viaPlace = ref<OsmPlace | null>(null)
  // The place named (#293) and what OpenStreetMap made of it: gone through, or only headed for.
  const viaName = ref('')
  const namedChoice = ref<NamedPlaceChoice | null>(null)
  let namedSearch: { key: string, places: NamedPlace[] } | null = null
  // How far the peak or water point was looked for (m).
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
  // The gain aimed at (#294), within what the sport's loops can climb (the slider's range narrows with the sport).
  const aimsAtGain = computed(() => !forSession.value && target.value === 'gain')
  const gainTargetM = computed(() => {
    const { min, max } = loopGainRange(editor.details.sport_type)
    return Math.min(Math.max(gainM.value, min), max)
  })
  const targetM = computed(() => forSession.value
    ? Math.round(session.value?.distanceM ?? 0)
    : target.value === 'distance' || (target.value === 'gain' && gainWithDistance.value)
    ? Math.round(distanceKm.value * 1000)
    : target.value === 'gain'
    ? loopLengthForGain(editor.details.sport_type, gainTargetM.value)
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
    namedChoice.value = null
  }

  // By the gain asked for (#294), else by climbing; paths (#295) then come first by tenths of their share.
  const byGainOrClimb = () => aimsAtGain.value
    ? rankByTotalGain(proposals.value, gainTargetM.value)
    : rankByClimb(proposals.value, editor.details.sport_type, climb.value)

  // The highlighted proposal stays highlighted where it moves.
  function rank() {
    const seed = highlighted.value === null ? null : proposals.value[highlighted.value]?.seed
    proposals.value = forSession.value && session.value
      ? rankForSession(proposals.value, session.value)
      : pathsActive.value
      ? rankByPaths(byGainOrClimb())
      : byGainOrClimb()
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

  // A named place (#293), searched around the start as far as a loop can head for; gone through when in reach.
  async function findNamed(name: string, from: LngLat, current: number): Promise<NamedPlaceChoice | null> {
    if (!namedPlaceCore(name)) {
      viaStatus.value = 'vague'
      return null
    }
    const reachM = viaSearchRadius(targetM.value, LOOP_TOLERANCES[precision.value])
    const key = `${name}:${from.join(',')}`
    viaStatus.value = 'searching'
    let places: NamedPlace[]
    try {
      places = namedSearch?.key === key ? namedSearch.places : await searchNamedPlaces(name, from, $i18n.locale.value)
      namedSearch = { key, places }
    }
    catch {
      if (current === generation) viaStatus.value = 'failed'
      return null
    }
    if (current !== generation) return null
    const choice = pickNamedPlace(name, places, from, reachM)
    namedChoice.value = choice
    viaStatus.value = choice ? 'found' : 'none'
    return choice
  }

  // The point the proposals go through, drawn on the map: a peak, a water point or a named place in reach.
  const viaPoint = computed<LngLat | null>(() => viaPlace.value?.coordinates
    ?? (namedChoice.value?.role === 'via' ? namedChoice.value.place.coordinates : null))

  // The start is shared with the hand-drawn mode (#215): the track's start when there is one.
  function show() {
    forSession.value = false
    session.value = null
    open.value = true
    start.value = editor.waypoints[0] ?? start.value
    placingStart.value = !start.value
  }

  function hide() {
    clearProposals()
    open.value = false
    forSession.value = false
    session.value = null
    placingStart.value = false
  }

  // The session mode (#266): a road run at the member's running pace, as the coach plans it, from the shared
  // start. The session comes once the panel has worked it out (`setSession`).
  function showSession() {
    show()
    forSession.value = true
    editor.details.sport_type = 'running'
  }

  function setSession(plan: SessionPlan | null) {
    session.value = plan
  }

  // Leaving the editor: a draft keeps its start in its track, and a saved route mustn't lend its own to the next one.
  function leave() {
    hide()
    start.value = null
    fromCoach.value = false
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
  watch([() => editor.details.sport_type, shape, via, viaName], () => {
    // The session mode has no sport to pick: saving its route resets the editor's.
    if (!forSession.value) clearProposals()
  }, { flush: 'sync' })
  watch(session, clearProposals, { flush: 'sync' })
  // When no proposal comes near the gain asked for (#294): the terrain around the start doesn't allow it.
  const gainMissed = computed(() => aimsAtGain.value && !generating.value ? gainShortfall(proposals.value, gainTargetM.value) : null)

  // Paths (#295): proposals of another profile would mislead; on the same profile (hiking, mountain bike), ranking
  // again is enough.
  watch(preferPaths, (now, before) => {
    if (forSession.value) return
    const sport = editor.details.sport_type
    if (loopProfile(sport, now) !== loopProfile(sport, before)) clearProposals()
    else if (proposals.value.length && !generating.value) rank()
  }, { flush: 'sync' })
  // Ranking again costs no request, by climbing or by the gain asked for (#294).
  watch([climb, target, gainTargetM], () => {
    if (!forSession.value && proposals.value.length && !generating.value) rank()
  })

  // One request per proposal, each with its own seed (direction): they show up as they come back, then are ranked
  // by climbing. A place to go through is looked for first; without one in reach, the proposals go without.
  async function generate() {
    if (!canGenerate.value || !start.value) return
    clearProposals()
    ranking.value = true
    const current = generation
    const from = start.value
    // A session's loops keep to its distance, with none of the loop mode's options.
    const plan = forSession.value ? session.value : null
    const name = viaName.value.trim()
    const kind = plan ? 'none' : via.value
    const place = kind === 'peak' || kind === 'water' ? await findVia(kind, from, current) : null
    const named = kind === 'named' && name ? await findNamed(name, from, current) : null
    if (current !== generation) return
    const through = place?.coordinates ?? (named?.role === 'via' ? named.place.coordinates : undefined)
    const firstSeed = Math.floor(Math.random() * (1_000_000 - LOOP_PROPOSALS))
    const body: Omit<RoutingLoopRequest, 'seed'> = {
      start: from,
      length_m: targetM.value,
      // The session's run, whatever the editor's sport: its default sport may be preselected after showSession().
      sport_type: plan ? 'running' : editor.details.sport_type,
      shape: plan ? 'loop' : shape.value,
      precision: plan ? 'precise' : precision.value,
      ...(through ? { via: through } : {}),
      ...(named?.role === 'heading' ? { heading: named.bearingDeg } : {}),
      ...(!plan && pathsActive.value ? { prefer_paths: true } : {}),
    }
    const hill = plan ? sessionHill(plan) : null
    proposals.value = Array.from({ length: LOOP_PROPOSALS }, (_, i): LoopProposal => ({
      seed: firstSeed + i,
      status: 'loading',
      coordinates: [],
      elevations: null,
      wayInfo: null,
      distanceM: 0,
      gainM: null,
      pathShare: null,
      climbs: null,
      error: null,
    }))
    await Promise.all(proposals.value.map(async ({ seed }, i) => {
      try {
        const result = await $fetch<RoutingLoopResponse>('/api/routing/loop', { method: 'POST', body: { ...body, seed } })
        if (current !== generation) return
        editor.routingQuotaRemaining = result.quota_remaining
        const along = trackDistances(result.coordinates)
        Object.assign(proposals.value[i]!, {
          status: 'ready',
          coordinates: result.coordinates,
          elevations: result.elevations,
          wayInfo: result.way_info ?? null,
          distanceM: along.at(-1) ?? 0,
          pathShare: pathShare(result.way_info ?? null, along),
          gainM: elevationStats(result.coordinates, result.elevations).gain,
          climbs: hill && result.elevations ? sessionClimbs(result.coordinates, result.elevations, hill) : null,
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

  // A sentence fills the settings it mentions (#216), the others staying as they are; gives those it changed.
  function applySentence(settings: LoopSentenceSettings): LoopSentenceSetting[] {
    const changed: LoopSentenceSetting[] = []
    const set = <T>(key: LoopSentenceSetting, current: T, next: T | null, apply: (value: T) => void) => {
      if (next === null || next === current) return
      apply(next)
      changed.push(key)
    }
    set('sport', editor.details.sport_type, settings.sport, (value) => { editor.details.sport_type = value })
    // A gain (#294) goes with the sentence's distance, or alone: the length then comes from it.
    const asked = settings.target
    // Absent from an answer that predates it: no gain.
    const gain = settings.gain ?? null
    if (asked || gain !== null) {
      const kind: LoopTarget = gain !== null ? 'gain' : asked!.kind
      const withDistance = asked?.kind === 'distance'
      const same = target.value === kind
        && (kind !== 'gain' || (gainM.value === gain && gainWithDistance.value === withDistance))
        && (asked?.kind !== 'distance' || distanceKm.value === asked.km)
        && (asked?.kind !== 'duration' || durationMin.value === asked.min)
      if (!same) {
        target.value = kind
        if (asked?.kind === 'distance') distanceKm.value = asked.km
        if (asked?.kind === 'duration') durationMin.value = asked.min
        if (gain !== null) {
          gainM.value = gain
          gainWithDistance.value = withDistance
        }
        changed.push('target')
      }
    }
    set('precision', precision.value, settings.precision, (value) => { precision.value = value })
    set('shape', shape.value, settings.shape, (value) => { shape.value = value })
    set('climb', climb.value, settings.climb, (value) => { climb.value = value })
    const place = settings.place
    if (place && (via.value !== 'named' || viaName.value !== place.name)) {
      via.value = 'named'
      viaName.value = place.name
      changed.push('via')
    }
    // Not for a road ride (the editor's sport when the sentence names none): the option is hidden.
    if (canPreferPaths(editor.details.sport_type)) set('paths', preferPaths.value, settings.paths, (value) => { preferPaths.value = value })
    // Proposals of other settings, even still loading, would block the sentence's own and mislead.
    if (changed.length) clearProposals()
    return changed
  }

  // Replaces the editor's track (undo brings it back).
  function choose(index: number) {
    const proposal = proposals.value[index]
    if (proposal?.status !== 'ready') return
    editor.loadLoop(proposal)
    hide()
  }

  // The picked proposal: the one highlighted (from the list or the map), else the first one ready once every
  // answer is in (the first to come back isn't always the first one).
  const picked = computed(() => {
    const ready = (i: number | null) => i !== null && proposals.value[i]?.status === 'ready'
    if (ready(highlighted.value)) return highlighted.value
    if (generating.value) return null
    const first = proposals.value.findIndex(proposal => proposal.status === 'ready')
    return first < 0 ? null : first
  })
  // The map shows the picked one above the others.
  watch(picked, (index) => {
    if (index !== null) highlighted.value = index
  })

  return {
    open, forSession, session, fromCoach, picked, start, placingStart, target, distanceKm, durationMin, gainM, gainWithDistance,
    aimsAtGain, gainTargetM, gainMissed, shape, precision, climb, via, viaStatus, viaPlace,
    preferPaths, pathsActive,
    viaName, namedChoice, viaPoint, viaRadiusM, proposals, highlighted, settledCount,
    gainPerKmM, targetM, targetInRange, generating, canGenerate,
    show, showSession, setSession, hide, leave, switchToManual, setStart, generate, choose, applySentence,
  }
})
