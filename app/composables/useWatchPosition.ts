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
// fixes up to 5 s old saves some battery.
export function useWatchPosition() {
  const { t } = useI18n()
  const fix = shallowRef<GpsFix | null>(null)
  const error = ref<string | null>(null)
  let watchId: number | undefined

  onMounted(() => {
    if (!('geolocation' in navigator)) {
      error.value = t('gps.unsupported')
      return
    }
    watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        fix.value = { position: [coords.longitude, coords.latitude], accuracyM: coords.accuracy, altitudeM: coords.altitude }
        error.value = null
      },
      // Timeouts are not reported: the watch keeps trying.
      ({ code }) => {
        if (ERROR_KEYS[code]) error.value = t(ERROR_KEYS[code])
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    )
  })

  onBeforeUnmount(() => {
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
  })

  return { fix, error }
}
