import { registerPlugin } from '@capacitor/core'
import type { AppPlugin } from '@capacitor/app'
import type { AndroidRelease } from '#shared/types/androidRelease'

// In the Android app, a notice when a newer APK was released on GitHub (#337). The site carries it, so apps already
// installed get it on the next deploy. Closing it hides it until the next version (localStorage).
const DISMISSED_KEY = 'sport-map:android-update-dismissed'

function readDismissed(): number | null {
  try {
    const value = Number(localStorage.getItem(DISMISSED_KEY))
    return Number.isInteger(value) && value > 0 ? value : null
  }
  catch {
    return null
  }
}

function saveDismissed(code: number) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(code))
  }
  catch {
    // Private storage unavailable: the notice comes back on the next launch.
  }
}

// versionCode of the installed app; null when the plugin is missing (an app built before @capacitor/app).
async function installedVersionCode(): Promise<number | null> {
  const info = await registerPlugin<AppPlugin>('App').getInfo().catch(() => null)
  const code = Number(info?.build)
  return Number.isInteger(code) ? code : null
}

export default defineNuxtPlugin((nuxtApp) => {
  if (!isNativeApp()) return
  const user = useSupabaseUser()
  const toast = useToast()
  const t = nuxtApp.$i18n.t

  async function check() {
    // The release route is for members only (server/middleware/family-only.ts).
    const latest = await $fetch<AndroidRelease | null>('/api/app/android-release').catch(() => null)
    const installedCode = await installedVersionCode()
    if (!latest || installedCode === null || !shouldOfferAndroidUpdate({ installedCode, latestCode: latest.versionCode, dismissedCode: readDismissed() })) return
    // Downloading closes the toast too, but only the close button hides it until the next version: a download that
    // failed or wasn't installed is offered again at the next launch.
    let downloading = false
    toast.add({
      id: 'android-update',
      title: t('androidApp.update.title'),
      // A debug build is signed with another key: Android refuses the release over it.
      description: isDebugAndroidBuild(installedCode)
        ? t('androidApp.update.descriptionDebug', { version: latest.versionName })
        : t('androidApp.update.description', { version: latest.versionName }),
      icon: 'i-lucide-download',
      color: 'info',
      duration: 0,
      actions: [{
        label: t('androidApp.update.download'),
        icon: 'i-lucide-download',
        onClick: () => {
          downloading = true
          // github.com isn't the app's host: Capacitor hands it to the phone's browser, which downloads the APK.
          window.location.assign(latest.apkUrl)
        },
      }],
      'onUpdate:open': (open: boolean) => {
        if (!open && !downloading) saveDismissed(latest.versionCode)
      },
    })
  }

  // Once per launch, as soon as a member is signed in.
  let checked = false
  nuxtApp.hooks.hookOnce('app:mounted', () => {
    watch(user, (claims) => {
      if (!claims || checked) return
      checked = true
      void check()
    }, { immediate: true })
  })
})
