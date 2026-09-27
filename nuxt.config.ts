// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/supabase',
    // The PWA plugin imports a virtual module that does not exist in Vitest's Nuxt environment.
    ...(process.env.VITEST ? [] : ['@vite-pwa/nuxt']),
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
      meta: [{ name: 'theme-color', content: '#16a34a' }],
    },
  },

  // Overridable at runtime via NUXT_OPENROUTESERVICE_KEY / NUXT_PUBLIC_MAPTILER_KEY.
  runtimeConfig: {
    openrouteserviceKey: '',
    public: {
      maptilerKey: '',
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
    registerType: 'autoUpdate',
    manifest: {
      name: 'sport-map',
      short_name: 'sport-map',
      description: 'Crée, partage et découvre des parcours de course, randonnée et vélo.',
      lang: 'fr',
      theme_color: '#16a34a',
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
    workbox: {
      // Pages are server-rendered: never answer navigations with a cached shell.
      navigateFallback: null,
      globPatterns: ['**/*.{js,css,svg,ico,png,woff2}'],
    },
    client: {
      installPrompt: true,
    },
  },
})
