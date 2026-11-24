// Whether to offer the Android app's APK (#337): in an Android browser or the installed PWA, not in the app itself,
// nor on an iPhone or a computer. Only known once mounted (the server can't tell the app from a browser), so the
// page renders without it first and hydration matches.
export function useAndroidDownload() {
  const visible = ref(false)
  onMounted(() => {
    visible.value = !isNativeApp() && isAndroidBrowser(navigator.userAgent)
  })
  return { visible }
}
