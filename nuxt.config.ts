// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/supabase',
    // The PWA plugin imports a virtual module that does not exist in Vitest's Nuxt environment; Sentry is
    // useless there.
    ...(process.env.VITEST ? [] : ['@vite-pwa/nuxt', '@sentry/nuxt/module']),
  ],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      // Generated from public/icon.svg by `npm run pwa:assets`.
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
      ],
    },
  },

  // Overridable at runtime via NUXT_OPENROUTESERVICE_KEY / NUXT_OPEN_METEO_URL / NUXT_PUBLIC_MAPTILER_KEY /
  // NUXT_PUBLIC_SENTRY_DSN.
  runtimeConfig: {
    openrouteserviceKey: '',
    // Routing requests per user and per day (NUXT_ROUTING_DAILY_LIMIT): the free OpenRouteService quota is
    // 2,000 a day for the whole app.
    routingDailyLimit: 300,
    // Weather forecast API (free, no key). The e2e tests point it at a local fake.
    openMeteoUrl: 'https://api.open-meteo.com/v1/forecast',
    public: {
      maptilerKey: '',
      // Error reporting is off without a DSN (locally, in tests).
      sentry: {
        dsn: '',
        environment: process.env.VERCEL_ENV ?? 'development',
      },
    },
  },

  // Client source maps for readable Sentry stack traces, not referenced by the served files.
  sourcemap: { client: 'hidden' },

  // Source maps are uploaded when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set (Vercel builds),
  // then deleted so that they are not served.
  sentry: {
    telemetry: false,
    sourcemaps: {
      filesToDeleteAfterUpload: ['.output/public/**/*.map', '.vercel/output/static/**/*.map'],
    },
  },

  nitro: {
    // Server functions next to the Supabase database (eu-west-1, Dublin): each query stays in the same region.
    vercel: { functions: { regions: ['dub1'] } },
  },

  supabase: {
    // Auth gating is handled per page with our own middleware.
    redirect: false,
    types: '~~/shared/types/database.types.ts',
  },

  pwa: {
    // Our own service worker (service-worker/sw.ts): it also serves the routes prepared for offline use.
    // Relative to Vite's root, the app/ directory.
    strategies: 'injectManifest',
    srcDir: '../service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    manifest: {
      name: 'sport-map',
      short_name: 'sport-map',
      description: 'Crée, partage et découvre des parcours de course, randonnée et vélo.',
      lang: 'fr',
      theme_color: '#4f46e5',
      background_color: '#ffffff',
      display: 'standalone',
      // Generated from public/icon.svg by `npm run pwa:assets`.
      icons: [
        { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      // App files, and the build manifest Nuxt reads when the app starts (needed offline). Pages are
      // server-rendered: they are not precached.
      globPatterns: ['**/*.{js,css,svg,ico,png,woff2}', '_nuxt/builds/meta/*.json'],
    },
    client: {
      installPrompt: true,
    },
  },
})
