import { registerPlugin } from '@capacitor/core'
import type { SplashScreenPlugin } from '@capacitor/splash-screen'

// In the Android app, the launch screen covers the WebView while the site loads (capacitor.config.ts) instead of
// leaving it blank: hide it once the page is hydrated. An app installed before the plugin rejects the call.
export default defineNuxtPlugin((nuxtApp) => {
  if (!isNativeApp()) return
  nuxtApp.hooks.hookOnce('app:suspense:resolve', () => {
    registerPlugin<SplashScreenPlugin>('SplashScreen').hide().catch(() => {})
  })
})
