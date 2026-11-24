// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/supabase',
    '@nuxtjs/i18n',
    // Generates .nuxt/eslint.config.mjs (auto-imports, Vue, TypeScript), extended by eslint.config.mjs.
    '@nuxt/eslint',
    // The PWA plugin imports a virtual module that does not exist in Vitest's Nuxt environment; Sentry is
    // useless there.
    ...(process.env.VITEST ? [] : ['@vite-pwa/nuxt', '@sentry/nuxt/module']),
  ],

  css: ['~/assets/css/main.css'],

  // The fonts of text, headings and key figures (--font-sans, --font-display and --font-numbers in main.css), served
  // from /_fonts/ and precached by the service worker (woff2 in globPatterns below). Only the weights and the subset
  // in use, normal style only (italics are synthesized), to keep the precache small.
  fonts: {
    families: [
      { name: 'Barlow', provider: 'google', weights: [400, 500, 600, 700], styles: ['normal'], subsets: ['latin'] },
      { name: 'Barlow Condensed', provider: 'google', weights: [600, 700], styles: ['normal'], subsets: ['latin'] },
      { name: 'Barlow Semi Condensed', provider: 'google', weights: [500, 600], styles: ['normal'], subsets: ['latin'] },
    ],
  },

  app: {
    head: {
      // cover: the page is drawn under the phone's status and navigation bars (the Android app's would be black
      // otherwise, #318) and leaves room for them with env(safe-area-inset-*).
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      // Generated from public/icon.svg by `npm run pwa:assets`.
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
      ],
      // For the family only: kept out of search engines (public/robots.txt forbids crawling too).
      meta: [{ name: 'robots', content: 'noindex, nofollow' }],
    },
  },

  // Overridable at runtime via NUXT_OPENROUTESERVICE_KEY / NUXT_OPEN_METEO_URL / NUXT_IGN_ALTIMETRY_URL /
  // NUXT_OPEN_METEO_ELEVATION_URL / NUXT_PUBLIC_MAPTILER_KEY / NUXT_PUBLIC_SENTRY_DSN.
  runtimeConfig: {
    openrouteserviceKey: '',
    // Routing requests per user and per day (NUXT_ROUTING_DAILY_LIMIT): the free OpenRouteService quota is
    // 2,000 a day for the whole app.
    routingDailyLimit: 300,
    // Loop described in a sentence (#216), read by an LLM: provider (NUXT_LOOP_LLM_PROVIDER, adapters in
    // server/utils/loopLlm.ts), its key (NUXT_LOOP_LLM_KEY, the feature answers 503 without one), model and
    // endpoint (NUXT_LOOP_LLM_URL, the provider's own when empty). Groq's free tier is about 1,000 requests a day
    // for the whole app, hence the per-member limit (NUXT_LOOP_SENTENCE_DAILY_LIMIT).
    loopLlmProvider: 'groq',
    loopLlmKey: '',
    loopLlmModel: 'openai/gpt-oss-120b',
    loopLlmUrl: '',
    loopSentenceDailyLimit: 30,
    // Optional GitHub token (NUXT_GITHUB_TOKEN) for reading the latest Android release (#337): without one, GitHub
    // allows 60 requests an hour per IP, shared with everything else running on Vercel's IPs. Cached for an hour anyway.
    githubToken: '',
    // Weather forecast API (free, no key). The e2e tests point it at a local fake.
    openMeteoUrl: 'https://api.open-meteo.com/v1/forecast',
    // Elevations of tracks imported without any (#71): the IGN's in France (NUXT_IGN_ALTIMETRY_URL), Open-Meteo's
    // elsewhere (NUXT_OPEN_METEO_ELEVATION_URL). Both free, without a key; the e2e tests point them at the local fake.
    ignAltimetryUrl: 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json',
    openMeteoElevationUrl: 'https://api.open-meteo.com/v1/elevation',
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

  // Same URLs in every language (a shared link opens in each visitor's language): the language comes from the
  // cookie, else from the browser on the first visit. Messages live in i18n/locales/ and are bundled by
  // app/plugins/i18n-messages.ts: no locale files here, or the module would fetch them from its /_i18n endpoint
  // when a page starts, delaying hydration and failing offline (follow mode).
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'fr',
    locales: [
      { code: 'fr', language: 'fr-FR', name: 'Français' },
      { code: 'en', language: 'en-GB', name: 'English' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'sport-map-locale',
      fallbackLocale: 'fr',
    },
  },

  pwa: {
    // Our own service worker (service-worker/sw.ts): it also serves the routes prepared for offline use.
    // Relative to Vite's root, the app/ directory.
    strategies: 'injectManifest',
    srcDir: '../service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    manifest: {
      name: 'sportmap',
      short_name: 'sportmap',
      description: 'Crée, partage et découvre des parcours de course, randonnée et vélo.',
      lang: 'fr',
      theme_color: '#4f46e5',
      // The light paper (--color-topo-100 in main.css), behind the splash screen.
      background_color: '#f3eee3',
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
      // The sign-in page's background: only seen online, without a session.
      globIgnores: ['img/login-*'],
    },
    client: {
      installPrompt: true,
    },
  },
})
