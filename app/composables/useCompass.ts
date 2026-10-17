import type { CompassState, OrientationReading } from '~/utils/compass'

// With no reading for this long after listening starts, the device is taken as having no compass.
const SILENT_MS = 3000

type IosOrientationEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<PermissionState> }

// Phone compass of follow mode and outing recording (#98), listened to while the component is mounted and the page
// visible. Chrome, Android and the Android app's WebView: `deviceorientationabsolute`. Others: `deviceorientation`,
// when it is relative to north (`absolute`, or iOS's `webkitCompassHeading`). iOS only sends it once
// `DeviceOrientationEvent.requestPermission()` is granted, which Safari allows during a tap only: the first tap on the
// page asks, so does turning the heading-up map on.
export function useCompass() {
  // Degrees clockwise from north of the top of the screen, smoothed; null until the compass answers
  const heading = ref<number | null>(null)
  // False when the compass is refused, missing (computers) or silent; null until known
  const available = ref<boolean | null>(null)
  let eventName: 'deviceorientationabsolute' | 'deviceorientation' | null = null
  let needsPermission = false
  let granted = false
  let permission: Promise<void> | null = null
  let listening = false
  let state: CompassState | null = null
  let publishedAt = 0
  let silentTimer: ReturnType<typeof setTimeout> | undefined

  function screenAngle(): number {
    return screen.orientation?.angle ?? Number((window as { orientation?: number }).orientation ?? 0)
  }

  function onReading(event: DeviceOrientationEvent) {
    const headingDeg = screenHeading(event as DeviceOrientationEvent & OrientationReading, screenAngle())
    if (headingDeg === null) {
      // What browsers send once when the device has no such sensor
      if (event.alpha === null && available.value === null) available.value = false
      return
    }
    available.value = true
    const now = Date.now()
    state = smoothCompass(state, headingDeg, now)
    if (heading.value === null || now - publishedAt >= COMPASS_PUBLISH_MS) {
      publishedAt = now
      heading.value = Math.round(state.deg) % 360
    }
  }

  function listen() {
    if (listening || !eventName || (needsPermission && !granted) || document.visibilityState !== 'visible') return
    listening = true
    window.addEventListener(eventName, onReading as EventListener)
    clearTimeout(silentTimer)
    silentTimer = setTimeout(() => {
      if (available.value === null) available.value = false
    }, SILENT_MS)
  }

  function mute() {
    if (!listening || !eventName) return
    listening = false
    window.removeEventListener(eventName, onReading as EventListener)
    clearTimeout(silentTimer)
    state = null
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') listen()
    else mute()
  }

  // Asks iOS for the compass; resolves at once elsewhere. To call from a tap.
  function requestPermission(): Promise<void> {
    if (!eventName || granted) return Promise.resolve()
    if (!needsPermission) {
      // Recent Chromium has it too and doesn't need it so far: asked anyway, in case a browser starts gating the sensor.
      (DeviceOrientationEvent as IosOrientationEvent).requestPermission?.().catch(() => {})
      return Promise.resolve()
    }
    permission ??= (DeviceOrientationEvent as IosOrientationEvent).requestPermission!().then(
      (answer) => {
        granted = answer === 'granted'
        if (granted) listen()
        else available.value = false
        removeTapListeners()
      },
      // Not during a tap: the next one asks again.
      () => {
        permission = null
      },
    )
    return permission
  }

  function onTap() {
    requestPermission()
  }

  function removeTapListeners() {
    document.removeEventListener('click', onTap, true)
    document.removeEventListener('touchend', onTap, true)
  }

  onMounted(() => {
    if ('ondeviceorientationabsolute' in window) eventName = 'deviceorientationabsolute'
    else if ('DeviceOrientationEvent' in window) eventName = 'deviceorientation'
    else {
      available.value = false
      return
    }
    // Recent Chromium also has requestPermission, but sends the absolute event without it.
    needsPermission = eventName === 'deviceorientation'
      && typeof (DeviceOrientationEvent as IosOrientationEvent).requestPermission === 'function'
    if (needsPermission) {
      document.addEventListener('click', onTap, true)
      document.addEventListener('touchend', onTap, true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    listen()
  })

  onBeforeUnmount(() => {
    mute()
    removeTapListeners()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { heading, available, requestPermission }
}
