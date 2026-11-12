import { SystemBars, SystemBarsStyle } from '@capacitor/core'

// In the Android app, the page is drawn under the status and navigation bars (viewport-fit=cover, nuxt.config.ts),
// so their icons follow the app's color mode, not the phone's: dark icons on the cream, light ones on "nuit topo".
export default defineNuxtPlugin(() => {
  if (!isNativeApp()) return
  const colorMode = useColorMode()
  watch(() => colorMode.value, (mode) => {
    SystemBars.setStyle({ style: mode === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
  }, { immediate: true })
})
