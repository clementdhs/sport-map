/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { isOfflinePagePath, MAP_HOSTS, OFFLINE_CACHE_PREFIX } from '../shared/utils/offlineMaps'

// Service worker of the PWA (built by @vite-pwa/nuxt, injectManifest strategy). Besides caching the app's
// own files, it serves the routes prepared for offline use (app/utils/offlineRoute.ts) when the network fails.

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] }

// Scripts, styles, icons and fonts of the app, as the previous generated service worker did.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// registerType 'autoUpdate': a new version takes over at once.
self.skipWaiting()
clientsClaim()

async function fromOfflineCaches(request: Request): Promise<Response | undefined> {
  const names = (await caches.keys()).filter(name => name.startsWith(OFFLINE_CACHE_PREFIX))
  for (const name of names) {
    const cached = await (await caches.open(name)).match(request, { ignoreVary: true })
    if (cached) return cached
  }
  return undefined
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Map files of prepared routes come from the phone, even online: it also spares the monthly map quota.
  if (MAP_HOSTS.includes(url.hostname)) {
    event.respondWith(fromOfflineCaches(request).then(cached => cached ?? fetch(request)))
    return
  }

  // Follow page and route data: fresh when online, the prepared copy otherwise.
  if (url.origin === self.location.origin && isOfflinePagePath(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => (await fromOfflineCaches(request)) ?? Response.error()))
  }
})
