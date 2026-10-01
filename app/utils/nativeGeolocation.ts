import { Capacitor, registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin, CallbackError, Location } from '@capacitor-community/background-geolocation'
import type { GpsFix } from '~/composables/useWatchPosition'

// True inside the Android app: a Capacitor shell that loads the hosted site (capacitor.config.ts) and
// injects its native bridge into the page.
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function locationToFix(location: Location): GpsFix {
  return {
    position: [location.longitude, location.latitude],
    accuracyM: location.accuracy,
    altitudeM: location.altitude,
  }
}

// Translation key of a native watcher error.
export function nativeErrorKey(error: CallbackError): string {
  return error.code === 'NOT_AUTHORIZED' ? 'gps.deniedApp' : 'gps.unavailable'
}

// Watches the position through a foreground service, so fixes keep coming with the screen off. Android shows
// a notification while it runs (title / message). Resolves to the function that stops the watch.
export async function watchNativePosition(
  notification: { title: string, message: string },
  onFix: (fix: GpsFix) => void,
  onError: (key: string) => void,
): Promise<() => void> {
  const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')
  // Android 13+ hides the service's notification without this permission; the watch works either way.
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.requestPermissions()
  }
  catch {}

  const id = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: notification.title,
      backgroundMessage: notification.message,
      requestPermissions: true,
      // The recorder and the follower filter fixes themselves.
      stale: false,
      distanceFilter: 0,
    },
    (location, error) => {
      if (error) onError(nativeErrorKey(error))
      else if (location) onFix(locationToFix(location))
    },
  )
  return () => {
    BackgroundGeolocation.removeWatcher({ id })
  }
}
