export default defineAppConfig({
  ui: {
    // Bottom toasts stay above the phone's navigation bar, the page being drawn under it (viewport-fit=cover, #318).
    toaster: { slots: { viewport: 'mb-[env(safe-area-inset-bottom)]' } },
    colors: {
      // Default accent, a terrain palette of main.css; the visitor's choice replaces it (plugins/accent.ts).
      primary: 'forest',
      // Warm "topo" neutrals defined in main.css (#227).
      neutral: 'topo',
    },
  },
})
