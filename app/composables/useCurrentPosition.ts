import type { LngLat } from '#shared/utils/routes'

// One reading of the device's position for the editor's start ("Ma position", #215), with a toast when it fails.
export function useCurrentPosition() {
  const { t } = useI18n()
  const toast = useToast()
  const locating = ref(false)

  function locate(onFound: (point: LngLat) => void) {
    if (!('geolocation' in navigator)) {
      toast.add({ title: t('editor.locateFailed'), description: t('gps.unsupported'), color: 'error' })
      return
    }
    locating.value = true
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        locating.value = false
        onFound([coords.longitude, coords.latitude])
      },
      ({ code, PERMISSION_DENIED }) => {
        locating.value = false
        const denied = isNativeApp() ? t('gps.deniedApp') : t('gps.denied')
        toast.add({ title: t('editor.locateFailed'), description: code === PERMISSION_DENIED ? denied : t('gps.unavailable'), color: 'error' })
      },
      { maximumAge: 60_000, timeout: 20_000 },
    )
  }

  return { locating, locate }
}
