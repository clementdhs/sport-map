import type { LngLat } from '#shared/utils/routes'

export interface GpsFix {
  position: LngLat
  // Radius (m) the real position is likely within
  accuracyM: number
}

const ERROR_MESSAGES: Record<number, string> = {
  1: 'Autorise l\'accès à ta position pour suivre le parcours.',
  2: 'Position indisponible : vérifie que la localisation de ton téléphone est activée.',
}

// Follows the GPS position while the component is mounted. High accuracy is needed on trails; accepting
// fixes up to 5 s old saves some battery.
export function useWatchPosition() {
  const fix = shallowRef<GpsFix | null>(null)
  const error = ref<string | null>(null)
  let watchId: number | undefined

  onMounted(() => {
    if (!('geolocation' in navigator)) {
      error.value = "Ce navigateur ne donne pas accès à la position."
      return
    }
    watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        fix.value = { position: [coords.longitude, coords.latitude], accuracyM: coords.accuracy }
        error.value = null
      },
      // Timeouts are not reported: the watch keeps trying.
      ({ code }) => {
        if (ERROR_MESSAGES[code]) error.value = ERROR_MESSAGES[code]
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    )
  })

  onBeforeUnmount(() => {
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
  })

  return { fix, error }
}
