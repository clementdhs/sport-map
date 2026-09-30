// Marks <html data-hydrated> once the page is hydrated. e2e tests wait for it before typing: hydration resets
// the inputs of server-rendered forms filled earlier (test/e2e/fixtures.ts, waitForHydration).
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hookOnce('app:suspense:resolve', () => {
    document.documentElement.dataset.hydrated = ''
  })
})
