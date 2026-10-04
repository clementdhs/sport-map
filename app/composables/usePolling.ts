// Calls `refresh` every `intervalMs` while the page is visible, and at once when it comes back into view (a
// phone unlocked, a tab reopened): no requests for a page nobody looks at.
export function usePolling(refresh: () => unknown, intervalMs: number) {
  let timer: ReturnType<typeof setInterval> | undefined

  function startTimer() {
    clearInterval(timer)
    timer = setInterval(refresh, intervalMs)
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      refresh()
      startTimer()
    }
    else {
      clearInterval(timer)
    }
  }

  onMounted(() => {
    if (document.visibilityState === 'visible') startTimer()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
}
