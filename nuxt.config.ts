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
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' }],
    },
  },

  // Overridable at runtime via NUXT_OPENROUTESERVICE_KEY / NUXT_PUBLIC_MAPTILER_KEY.
  runtimeConfig: {
    openrouteserviceKey: '',
    public: {
      maptilerKey: '',
    },
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
      icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
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
