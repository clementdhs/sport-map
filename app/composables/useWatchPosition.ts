import type { LngLat } from '#shared/utils/routes'

export interface GpsFix {
  position: LngLat
  // Radius (m) the real position is likely within
  accuracyM: number
  // GPS altitude (m), when the device provides it
  altitudeM: number | null
}

// Translation keys of the GeolocationPositionError codes worth explaining.
const ERROR_KEYS: Record<number, string> = {
  1: 'gps.denied',
  2: 'gps.unavailable',
}

// Follows the GPS position while the component is mounted. High accuracy is needed on trails; accepting
// fixes up to 5 s old saves some battery. In the Android app, positions come from a native foreground
// service instead and keep coming with the screen off (`background`).
export function useWatchPosition() {
  const { t } = useI18n()
  const fix = shallowRef<GpsFix | null>(null)
  const error = ref<string | null>(null)
  const background = ref(false)
  let watchId: number | undefined
  let stopNative: (() => void) | undefined
  let unmounted = false

  function onFix(value: GpsFix) {
    fix.value = value
    error.value = null
  }

  async function watchNative() {
    background.value = true
    try {
      const stop = await watchNativePosition(
        { title: t('gps.notificationTitle'), message: t('gps.notificationMessage') },
        onFix,
        key => error.value = t(key),
      )
      if (unmounted) stop()
      else stopNative = stop
    }
    catch {
      background.value = false
      error.value = t('gps.unavailable')
    }
  }

  onMounted(() => {
    if (isNativeApp()) {
      watchNative()
      return
    }
    if (!('geolocation' in navigator)) {
      error.value = t('gps.unsupported')
      return
    }
    watchId = navigator.geolocation.watchPosition(
      ({ coords }) => onFix({ position: [coords.longitude, coords.latitude], accuracyM: coords.accuracy, altitudeM: coords.altitude }),
      // Timeouts are not reported: the watch keeps trying.
      ({ code }) => {
        if (ERROR_KEYS[code]) error.value = t(ERROR_KEYS[code])
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    )
  })

  onBeforeUnmount(() => {
    unmounted = true
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
    stopNative?.()
  })

  return { fix, error, background }
}
