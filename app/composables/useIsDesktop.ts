// Same breakpoint as the page layout (md): panels open as popovers on a computer and as drawers on a phone.
// Starts as a phone so hydration matches the server.
export function useIsDesktop() {
  const isDesktop = ref(false)
  let query: MediaQueryList | undefined
  const update = (event: MediaQueryListEvent) => {
    isDesktop.value = event.matches
  }
  onMounted(() => {
    query = window.matchMedia('(min-width: 768px)')
    isDesktop.value = query.matches
    query.addEventListener('change', update)
  })
  onBeforeUnmount(() => query?.removeEventListener('change', update))
  return isDesktop
}
