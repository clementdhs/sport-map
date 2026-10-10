import { arrivalAfter, type LineSection, locateOnLine, locateOnLines, measureLine, MIN_SECTION_M, pointAlong, sectionCoordinates, sectionLength } from '#shared/utils/lineSection'
import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'
import type { TrackElevationsResponse } from '#shared/types/osm'
import { type ImportedTrack, resampleTrack } from '~/utils/gpx'

export type SectionEnd = 'from' | 'to'

// The section's track as the editor imports it, with its elevations once they are known.
interface SectionProfile {
  section: LineSection
  coordinates: LngLat[]
  elevations: number[] | null
}

// Elevations are asked once the ends stay still for this long.
const ELEVATION_DELAY_MS = 800

// A section of a marked route (#72), for a long-distance path no filter would keep. Its ends move along one of the
// route's lines: the whole route when it is complete, one of its pieces otherwise. Its elevations are asked from the
// server (IGN) when the ends stop moving, for its gain, then given to the editor with the track.
export const useOsmSectionStore = defineStore('osmSection', () => {
  const route = shallowRef<OsmRoute | null>(null)
  const lines = computed(() => route.value?.lines.map(measureLine) ?? [])
  // Replaced at each change: the profile knows which section it belongs to.
  const section = shallowRef<LineSection | null>(null)
  // The end a tap on the map places.
  const nextEnd = ref<SectionEnd>('from')
  const line = computed(() => section.value ? lines.value[section.value.line] ?? null : null)

  const coordinates = computed(() => line.value && section.value
    ? sectionCoordinates(line.value, section.value.from, section.value.to)
    : [])
  const length = computed(() => line.value && section.value ? sectionLength(line.value, section.value.from, section.value.to) : 0)
  const tooShort = computed(() => length.value < MIN_SECTION_M)
  const ends = computed(() => line.value && section.value
    ? { from: pointAlong(line.value, section.value.from), to: pointAlong(line.value, section.value.to) }
    : null)

  const profile = shallowRef<SectionProfile | null>(null)
  const elevationFailed = ref(false)
  const currentProfile = computed(() => profile.value?.section === section.value ? profile.value : null)
  const gain = computed(() => {
    const { coordinates, elevations } = currentProfile.value ?? {}
    return coordinates && elevations ? Math.round(elevationStats(coordinates, elevations).gain) : null
  })
  const gainStatus = computed(() => gain.value !== null ? 'known' : elevationFailed.value || tooShort.value ? 'unknown' : 'pending')

  function start(next: OsmRoute) {
    route.value = next
    // The longest piece of an incomplete route.
    const longest = lines.value.reduce((best, measured, i) => measured.length > lines.value[best]!.length ? i : best, 0)
    section.value = { line: longest, from: 0, to: lines.value[longest]!.length }
    nextEnd.value = 'from'
  }

  function stop() {
    route.value = null
    section.value = null
  }

  // A tap on the route places the next end; on another piece of an incomplete route, the section moves there.
  function pick(point: LngLat) {
    if (!section.value) return
    const position = locateOnLines(lines.value, point)
    const current = position.line === section.value.line
      ? section.value
      : { line: position.line, from: 0, to: lines.value[position.line]!.length }
    section.value = { ...current, [nextEnd.value]: position.along }
    nextEnd.value = nextEnd.value === 'from' ? 'to' : 'from'
  }

  // A dragged end stays on the section's line.
  function moveEnd(end: SectionEnd, point: LngLat) {
    if (section.value && line.value) section.value = { ...section.value, [end]: locateOnLine(line.value, point).along }
  }

  function setEnd(end: SectionEnd, meters: number) {
    if (section.value && line.value) section.value = { ...section.value, [end]: Math.min(Math.max(meters, 0), line.value.length) }
  }

  // The arrival follows a distance typed from the departure.
  function setLength(meters: number) {
    if (!section.value || !line.value) return
    const { from, to } = section.value
    section.value = { ...section.value, to: arrivalAfter(line.value, from, to, Math.max(meters, 0)) }
  }

  // Resampled like a whole route (osmRouteTrack), with its elevations when they were computed for this section.
  function sectionTrack(): SectionProfile | null {
    if (!section.value || tooShort.value) return null
    if (currentProfile.value) return currentProfile.value
    const points = resampleTrack(coordinates.value).map(([lng, lat]): LngLat => [lng!, lat!])
    return { section: section.value, coordinates: points, elevations: null }
  }

  function track(name: string | null): ImportedTrack | null {
    const sectionProfile = sectionTrack()
    return sectionProfile && { name, coordinates: sectionProfile.coordinates, elevations: sectionProfile.elevations }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let request = 0
  watch(section, () => {
    clearTimeout(timer)
    request++
    elevationFailed.value = false
    if (section.value && !tooShort.value) timer = setTimeout(fetchElevations, ELEVATION_DELAY_MS)
  })

  async function fetchElevations() {
    const current = sectionTrack()
    if (!current || current.elevations) return
    const id = request
    try {
      const { elevations } = await $fetch<TrackElevationsResponse>('/api/elevations', { method: 'POST', body: { coordinates: current.coordinates } })
      if (id === request && elevations.length === current.coordinates.length) profile.value = { ...current, elevations }
    }
    catch {
      if (id === request) elevationFailed.value = true
    }
  }

  return {
    route, lines, section, nextEnd, line, coordinates, length, tooShort, ends, gain, gainStatus,
    start, stop, pick, moveEnd, setEnd, setLength, track,
  }
})
