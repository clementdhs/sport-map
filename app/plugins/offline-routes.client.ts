// Prepared offline routes are a temporary cache (MapTiler's terms): expired ones are removed at startup.
export default defineNuxtPlugin(() => {
  if (!offlineSupported()) return
  // After the page is interactive: nothing urgent.
  setTimeout(() => purgeOfflineRoutes().catch(() => {}), 5000)
})
