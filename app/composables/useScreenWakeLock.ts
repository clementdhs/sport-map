// Keeps the screen on while the component is mounted (Screen Wake Lock API): a web page stops getting GPS
// positions once the screen turns off. The browser releases the lock when the page is hidden, so it is
// requested again when the page comes back.
export function useScreenWakeLock() {
  const supported = ref(true)
  const active = ref(false)
  let sentinel: WakeLockSentinel | null = null

  async function request() {
    if (!('wakeLock' in navigator)) {
      supported.value = false
      return
    }
    try {
      sentinel = await navigator.wakeLock.request('screen')
      active.value = true
      sentinel.addEventListener('release', () => {
        active.value = false
      })
    }
    catch {
      // Refused, e.g. in power saving mode.
      active.value = false
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && !active.value) request()
  }

  onMounted(() => {
    request()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    sentinel?.release()
  })

  return { supported, active }
}
