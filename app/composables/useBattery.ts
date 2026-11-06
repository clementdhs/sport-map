// The phone's battery level (0 to 1) while the component is mounted, for the data screen. Only Chromium
// browsers and the Android app's WebView tell it (Battery Status API): elsewhere `supported` stays false.
interface BatteryManager extends EventTarget {
  level: number
}

export function useBattery() {
  const supported = ref(false)
  const level = ref<number | null>(null)
  let battery: BatteryManager | null = null
  let unmounted = false

  function read() {
    if (battery) level.value = battery.level
  }

  onMounted(async () => {
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery
    if (typeof getBattery !== 'function') return
    try {
      const manager = await getBattery.call(navigator)
      if (unmounted) return
      battery = manager
      supported.value = true
      read()
      battery.addEventListener('levelchange', read)
    }
    catch { /* refused, e.g. by a permissions policy */ }
  })

  onBeforeUnmount(() => {
    unmounted = true
    battery?.removeEventListener('levelchange', read)
  })

  return { supported, level }
}
