import type { JumpToOptions, LngLat as MapLngLat, Map, MapLibreEvent, PaddingOptions } from 'maplibre-gl'
import type { FlyoverTrack } from '~/utils/flyover'
import type { FlyoverLayers } from '~/utils/routeLayers'

// Animated 3D flyover (#74) of the route page's map: a point moves along the route, or along an outing's GPS track
// at its own pace, and the camera follows it from behind and above. Created by the page (its button and controls),
// attached by the map once loaded. Touching the map pauses it; stopping goes back to the view it started from.

export interface FlyoverSubject {
  kind: 'route' | 'outing'
  track: FlyoverTrack
}

export const FLYOVER_SPEEDS = [0.5, 1, 2, 4]

// The camera turns towards the direction of travel measured over ±1 s of the flyover at ×1 (at least ±100 m),
// closing 63 % of the gap every second.
const HEADING_SPAN_S = 1
const MIN_HEADING_SPAN_M = 100
const HEADING_TAU_S = 1
// Glides to the moving point: from the route's overview when starting, back from where the visitor moved the map.
const INTRO_MS = 1500
const RESUME_MS = 800
const STOP_MS = 1000
// At most this much animation after a slow frame (or a hidden tab): no jump.
const MAX_FRAME_S = 0.1

interface View {
  center: MapLngLat
  zoom: number
  bearing: number
  pitch: number
  padding: PaddingOptions
}

export function useFlyover() {
  const subject = shallowRef<FlyoverSubject | null>(null)
  const playing = ref(false)
  const progress = ref(0)
  const speed = ref(1)
  // A map is attached: the flyover can start.
  const ready = ref(false)
  const along = computed(() => (subject.value ? flyoverAlong(subject.value.track, progress.value) : null))

  let map: Map | undefined
  let insets: () => PaddingOptions = () => ({ top: 0, right: 0, bottom: 0, left: 0 })
  // The floating controls, kept clear of the moving point.
  let controls: HTMLElement | undefined
  let layers: FlyoverLayers | undefined
  let before: View | undefined
  let frame = 0
  let lastFrame = 0
  let glideToken = 0
  let heading = 0
  let zoom = 13
  let durationS = 30
  let spanM = MIN_HEADING_SPAN_M
  // Reduced motion: the camera keeps the bearing the map had, and MapLibre makes its glides instant.
  let still = false
  // Glide to the moving point before playing (ms), when the camera isn't where the flyover put it; 0 when it is.
  let glideMs = INTRO_MS

  function onMoveStart(event: MapLibreEvent<unknown>) {
    if (!subject.value || !(event as { originalEvent?: Event }).originalEvent) return
    glideMs = RESUME_MS
    if (playing.value) pause()
  }

  function attach(instance: Map, mapInsets: () => PaddingOptions) {
    map = instance
    insets = mapInsets
    instance.on('movestart', onMoveStart)
    ready.value = true
  }

  function setControls(element: HTMLElement | undefined) {
    controls = element
  }

  function padding(): PaddingOptions {
    const base = insets()
    if (!map || !controls) return base
    const covered = map.getContainer().getBoundingClientRect().bottom - controls.getBoundingClientRect().top
    return { ...base, bottom: Math.max(base.bottom ?? 0, covered) }
  }

  function camera(dtS: number): JumpToOptions {
    const track = subject.value!.track
    const at = flyoverAlong(track, progress.value)
    const target = still ? null : flyoverHeading(track, at, spanM)
    if (target !== null) heading = dtS > 0 ? smoothBearing(heading, target, dtS, HEADING_TAU_S) : target
    const point = flyoverPoint(track, at)
    layers?.move(point)
    return { center: point, zoom, pitch: PITCH_3D, bearing: heading, padding: padding() }
  }

  function loop() {
    cancelAnimationFrame(frame)
    lastFrame = performance.now()
    const step = (now: number) => {
      const dtS = Math.min(MAX_FRAME_S, (now - lastFrame) / 1000)
      lastFrame = now
      progress.value = Math.min(1, progress.value + (dtS * speed.value) / durationS)
      map?.jumpTo(camera(dtS))
      if (progress.value >= 1) {
        playing.value = false
        return
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  }

  function play() {
    if (!map || !subject.value) return
    if (progress.value >= 1) {
      progress.value = 0
      glideMs = INTRO_MS
    }
    playing.value = true
    if (!glideMs) return loop()
    const token = ++glideToken
    // Ends a move under way first, whose end would be taken for the glide's. Then listens before gliding: without
    // animation (reduced motion), the glide ends before easeTo returns.
    map.stop()
    map.once('moveend', () => {
      if (token !== glideToken || !playing.value) return
      glideMs = 0
      loop()
    })
    map.easeTo({ ...camera(0), duration: glideMs })
  }

  function pause() {
    playing.value = false
    glideToken++
    cancelAnimationFrame(frame)
  }

  // A new flyover replaces the current one, which then doesn't go back to its starting view.
  function start(next: FlyoverSubject) {
    if (!map || next.track.line.coordinates.length < 2) return
    pause()
    layers?.remove()
    before ??= {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      padding: map.getPadding(),
    }
    const { line } = next.track
    durationS = flyoverDurationS(line.length)
    const groundSpeed = line.length / durationS
    zoom = flyoverZoom(groundSpeed, line.coordinates[0]![1])
    spanM = Math.max(MIN_HEADING_SPAN_M, groundSpeed * HEADING_SPAN_S)
    still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    heading = map.getBearing()
    layers = addFlyoverLayers(map, next.kind === 'outing' ? line.coordinates : null)
    subject.value = next
    progress.value = 0
    glideMs = INTRO_MS
    play()
  }

  // Moves the point there (dragging the controls' profile), playing or not.
  function seek(to: number) {
    if (!map || !subject.value) return
    progress.value = Math.min(1, Math.max(0, to))
    if (playing.value && glideMs) return
    map.jumpTo(camera(0))
    glideMs = 0
  }

  function nextSpeed() {
    speed.value = FLYOVER_SPEEDS[(FLYOVER_SPEEDS.indexOf(speed.value) + 1) % FLYOVER_SPEEDS.length]!
  }

  function stop() {
    pause()
    layers?.remove()
    layers = undefined
    if (map && before) map.easeTo({ ...before, duration: STOP_MS })
    before = undefined
    subject.value = null
    progress.value = 0
  }

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    map?.off('movestart', onMoveStart)
  })

  return reactive({
    subject,
    playing,
    progress,
    speed,
    ready,
    along,
    attach,
    setControls,
    start,
    play,
    pause,
    seek,
    nextSpeed,
    stop,
  })
}

export type Flyover = ReturnType<typeof useFlyover>
